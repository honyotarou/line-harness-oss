import {
  addTagToFriend,
  countActiveLineAccounts,
  createFormSubmission,
  enrollFriendInScenario,
  getFormById,
  getFriendById,
  getLineAccounts,
  getScenarioById,
  getTagById,
  jstNow,
} from '@line-crm/db';
import type { Form as DbForm } from '@line-crm/db';
import { resourceBelongsToFriendTenant } from '../services/resource-friend-tenant.js';
import type { Env } from '../index.js';
import { resolveFormSubmitFriendFromVerifiedToken } from './form-submit-friend.js';
import { serializeFormSubmission, type FormFieldDefinition } from './admin-forms.js';
import { parseFormFieldDefinitions } from './admin-forms.js';
import { lineAccountDbOptions } from '../services/line-account-at-rest-key.js';
import { resolveLineAccessTokenForFriend } from '../services/line-account-routing.js';
import { collectLineLoginChannelIds, verifyLineIdToken } from '../services/line-id-token.js';
import {
  pickFormFieldValuesForMetadataMerge,
  stripPrototypePollutionKeys,
} from '../services/form-metadata-filter.js';
import { resolveFormSubmitFlexFooterText } from '../services/form-submit-footer.js';
import { tryParseJsonRecord } from '../services/safe-json.js';

export type PublicFormSubmitBody = Readonly<{
  idToken?: string;
  data?: Record<string, unknown>;
}>;

type FormSubmitFailure = Readonly<{ ok: false; status: 400 | 401 | 404 | 409; body: unknown }>;

export type PublicFormSubmitResult =
  | Readonly<{
      ok: true;
      data: ReturnType<typeof serializeFormSubmission>;
    }>
  | FormSubmitFailure;

type WorkerBindings = Env['Bindings'];

function validateRequiredFields(
  fields: readonly FormFieldDefinition[],
  submissionData: Readonly<Record<string, unknown>>,
): string | null {
  for (const field of fields) {
    if (!field.required) {
      continue;
    }
    const value = submissionData[field.name];
    if (value === undefined || value === null || value === '') {
      return `${field.label} は必須項目です`;
    }
  }
  return null;
}

function buildSubmissionAnswerRows(
  submissionData: Readonly<Record<string, unknown>>,
  fields: readonly FormFieldDefinition[],
) {
  return Object.entries(submissionData).map(([key, value]) => {
    const field = fields.find((item) => item.name === key);
    const label = field?.label || key;
    const text = Array.isArray(value) ? value.join(', ') : String(value || '-') || '-';
    return {
      type: 'box' as const,
      layout: 'vertical' as const,
      margin: 'md' as const,
      contents: [
        { type: 'text' as const, text: label, size: 'xxs' as const, color: '#64748b' },
        {
          type: 'text' as const,
          text,
          size: 'sm' as const,
          color: '#1e293b',
          weight: 'bold' as const,
          wrap: true,
        },
      ],
    };
  });
}

function buildSubmissionFlexBubble(
  input: Readonly<{
    friendDisplayName: string | null;
    submissionData: Readonly<Record<string, unknown>>;
    fields: readonly FormFieldDefinition[];
    footerText: string;
  }>,
) {
  return {
    type: 'bubble',
    size: 'giga',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '診断結果', size: 'lg', weight: 'bold', color: '#1e293b' },
        {
          type: 'text',
          text: `${input.friendDisplayName || ''}さんのプロフィール`,
          size: 'xs',
          color: '#64748b',
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
      backgroundColor: '#f0fdf4',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        ...buildSubmissionAnswerRows(input.submissionData, input.fields),
        { type: 'separator', margin: 'lg' },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          backgroundColor: '#eff6ff',
          cornerRadius: 'md',
          paddingAll: '12px',
          contents: [
            {
              type: 'text',
              text: input.footerText,
              size: 'xxs',
              color: '#2563EB',
              wrap: true,
            },
          ],
        },
      ],
      paddingAll: '20px',
    },
  };
}

async function pushFormSubmissionFlex(
  input: Readonly<{
    db: D1Database;
    env: WorkerBindings;
    friendId: string;
    form: DbForm;
    submissionData: Readonly<Record<string, unknown>>;
    fields: readonly FormFieldDefinition[];
  }>,
): Promise<void> {
  console.log('Form reply: starting for friendId', input.friendId);
  const refreshedFriend = await getFriendById(input.db, input.friendId);
  if (!refreshedFriend?.line_user_id) {
    console.log('Form reply: no line_user_id');
    return;
  }

  console.log('Form reply: sending to', refreshedFriend.line_user_id);
  const { createLineClient } = await import('@line-crm/line-sdk');
  const accessToken = await resolveLineAccessTokenForFriend(
    input.db,
    input.env.LINE_CHANNEL_ACCESS_TOKEN,
    input.friendId,
    lineAccountDbOptions(input.env),
  );
  const lineClient = createLineClient(accessToken);
  const { buildMessage } = await import('../services/step-delivery.js');
  const flex = buildSubmissionFlexBubble({
    friendDisplayName: refreshedFriend.display_name,
    submissionData: input.submissionData,
    fields: input.fields,
    footerText: resolveFormSubmitFlexFooterText(input.env),
  });

  await lineClient.pushMessage(refreshedFriend.line_user_id, [
    buildMessage('flex', JSON.stringify(flex)),
  ]);
}

async function resolveSafeOnSubmitTagId(
  db: D1Database,
  tagId: string,
  friend: Readonly<{ line_account_id: string | null }>,
  multi: boolean,
): Promise<string | null> {
  const tag = await getTagById(db, tagId);
  if (!tag) return null;
  return resourceBelongsToFriendTenant(tag, friend, { multi }) ? tagId : null;
}

async function resolveSafeOnSubmitScenarioId(
  db: D1Database,
  scenarioId: string,
  friend: Readonly<{ line_account_id: string | null }>,
  multi: boolean,
): Promise<string | null> {
  const scenario = await getScenarioById(db, scenarioId);
  if (!scenario) return null;
  return resourceBelongsToFriendTenant(scenario, friend, { multi }) ? scenarioId : null;
}

async function runFormSubmissionSideEffects(
  input: Readonly<{
    db: D1Database;
    env: WorkerBindings;
    friendId: string;
    friendLineAccountId: string | null;
    form: DbForm;
    submissionData: Readonly<Record<string, unknown>>;
    fields: readonly FormFieldDefinition[];
  }>,
): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (input.form.save_to_metadata) {
    tasks.push(
      (async () => {
        const existingFriend = await getFriendById(input.db, input.friendId);
        if (!existingFriend) {
          return;
        }
        const existing = tryParseJsonRecord(existingFriend.metadata || '{}') ?? {};
        const allowedPatch = pickFormFieldValuesForMetadataMerge(
          { ...input.submissionData },
          input.fields.map((field) => ({ name: field.name })),
        );
        const merged = { ...existing, ...allowedPatch };
        await input.db
          .prepare(`UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?`)
          .bind(JSON.stringify(merged), jstNow(), input.friendId)
          .run();
      })(),
    );
  }

  const needsTenantCheck = Boolean(input.form.on_submit_tag_id || input.form.on_submit_scenario_id);
  const multi = needsTenantCheck ? (await countActiveLineAccounts(input.db)) > 1 : false;
  const friendTenant: Readonly<{ line_account_id: string | null }> = {
    line_account_id: input.friendLineAccountId,
  };

  if (input.form.on_submit_tag_id) {
    const safeTagId = await resolveSafeOnSubmitTagId(
      input.db,
      input.form.on_submit_tag_id,
      friendTenant,
      multi,
    );
    if (safeTagId) {
      tasks.push(addTagToFriend(input.db, input.friendId, safeTagId));
    } else {
      console.warn(
        `Form side-effect skipped: on_submit_tag_id=${input.form.on_submit_tag_id} does not belong to friend tenant ${input.friendLineAccountId ?? '(global)'}`,
      );
    }
  }
  if (input.form.on_submit_scenario_id) {
    const safeScenarioId = await resolveSafeOnSubmitScenarioId(
      input.db,
      input.form.on_submit_scenario_id,
      friendTenant,
      multi,
    );
    if (safeScenarioId) {
      tasks.push(enrollFriendInScenario(input.db, input.friendId, safeScenarioId));
    } else {
      console.warn(
        `Form side-effect skipped: on_submit_scenario_id=${input.form.on_submit_scenario_id} does not belong to friend tenant ${input.friendLineAccountId ?? '(global)'}`,
      );
    }
  }

  tasks.push(pushFormSubmissionFlex(input));

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Form side-effect failed:', result.reason);
    }
  }
}

export async function submitPublicForm(
  db: D1Database,
  env: WorkerBindings,
  formId: string,
  body: PublicFormSubmitBody,
): Promise<PublicFormSubmitResult> {
  const form = await getFormById(db, formId);
  if (!form) {
    return { ok: false, status: 404, body: { success: false, error: 'Form not found' } };
  }
  if (!form.is_active) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'This form is no longer accepting responses' },
    };
  }
  if (!body.idToken) {
    return { ok: false, status: 401, body: { success: false, error: 'idToken is required' } };
  }

  const submissionData = stripPrototypePollutionKeys(
    (body.data ?? {}) as Readonly<Record<string, unknown>>,
  ) as Readonly<Record<string, unknown>>;
  const fields = parseFormFieldDefinitions(form.fields || '[]');
  const requiredFieldError = validateRequiredFields(fields, submissionData);
  if (requiredFieldError) {
    return { ok: false, status: 400, body: { success: false, error: requiredFieldError } };
  }

  const channelIds = collectLineLoginChannelIds(
    env.LINE_LOGIN_CHANNEL_ID,
    await getLineAccounts(db, lineAccountDbOptions(env)),
  );
  const verified = await verifyLineIdToken(body.idToken, channelIds);
  if (!verified) {
    return { ok: false, status: 401, body: { success: false, error: 'Invalid ID token' } };
  }

  const friendResolution = await resolveFormSubmitFriendFromVerifiedToken(
    db,
    verified,
    lineAccountDbOptions(env),
  );
  if (!friendResolution.ok) {
    if (friendResolution.reason === 'ambiguous') {
      return {
        ok: false,
        status: 409,
        body: {
          success: false,
          error: 'Ambiguous LINE account for this user; contact support',
        },
      };
    }
    return { ok: false, status: 404, body: { success: false, error: 'Friend not found' } };
  }

  const submission = await createFormSubmission(db, {
    formId,
    friendId: friendResolution.friend.id,
    data: JSON.stringify(submissionData),
  });

  await runFormSubmissionSideEffects({
    db,
    env,
    friendId: friendResolution.friend.id,
    friendLineAccountId: friendResolution.friend.line_account_id ?? null,
    form,
    submissionData,
    fields,
  });

  return { ok: true, data: serializeFormSubmission(submission) };
}
