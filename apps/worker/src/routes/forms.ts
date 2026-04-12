import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  getForms,
  getFormById,
  createForm,
  updateForm,
  deleteForm,
  getFormSubmissions,
  createFormSubmission,
  getLineAccounts,
  jstNow,
} from '@line-crm/db';
import { getFriendByLineUserId, getFriendById } from '@line-crm/db';
import { addTagToFriend, enrollFriendInScenario } from '@line-crm/db';
import type { Form as DbForm, FormSubmission as DbFormSubmission } from '@line-crm/db';
import type { Env } from '../index.js';
import {
  isValidAdminAuthToken,
  readAdminSessionCookie,
  resolveAdminSessionSecret,
} from '../services/admin-session.js';
import { parseBearerAuthorization } from '../services/bearer-authorization.js';
import { collectLineLoginChannelIds, verifyLineIdToken } from '../services/line-id-token.js';
import { lineAccountDbOptions } from '../services/line-account-at-rest-key.js';
import { resolveLineAccessTokenForFriend } from '../services/line-account-routing.js';
import {
  BodyTooLargeError,
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  InvalidJsonBodyError,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import { enforceRateLimit } from '../services/request-rate-limit.js';
import { pickFormFieldValuesForMetadataMerge } from '../services/form-metadata-filter.js';
import { tryParseJsonArray, tryParseJsonRecord } from '../services/safe-json.js';

const forms = new Hono<Env>();
const PUBLIC_FORM_SUBMIT_LIMIT_BYTES = 64 * 1024;
const PUBLIC_FORM_SUBMIT_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

/** Fallback footer in the LINE Flex after LIFF form submit. Override with Worker var `FORM_SUBMIT_FLEX_FOOTER`. */
export const DEFAULT_FORM_SUBMIT_FLEX_FOOTER =
  'この内容はアカウントに記録され、タグやシナリオ等に利用される場合があります。チャットでの即時返信はできない場合があります。';

export function resolveFormSubmitFlexFooterText(env: { FORM_SUBMIT_FLEX_FOOTER?: string }): string {
  const custom = env.FORM_SUBMIT_FLEX_FOOTER?.trim();
  return custom && custom.length > 0 ? custom : DEFAULT_FORM_SUBMIT_FLEX_FOOTER;
}

function serializeForm(row: DbForm) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    fields: tryParseJsonArray(row.fields || '[]'),
    onSubmitTagId: row.on_submit_tag_id,
    onSubmitScenarioId: row.on_submit_scenario_id,
    saveToMetadata: Boolean(row.save_to_metadata),
    isActive: Boolean(row.is_active),
    submitCount: row.submit_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** LIFF-facing shape: no internal automation IDs or metrics. */
function serializeFormPublic(row: DbForm) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    fields: tryParseJsonArray(row.fields || '[]'),
    isActive: Boolean(row.is_active),
  };
}

async function resolveFormDefinitionReader(c: Context<Env>): Promise<'admin' | 'line' | null> {
  const bearer = parseBearerAuthorization(c.req.header('Authorization')) ?? '';
  const cookieToken = readAdminSessionCookie(c);
  const token = bearer || cookieToken || '';
  if (!token) return null;
  const sessionSecret = resolveAdminSessionSecret(c.env);
  if (sessionSecret && (await isValidAdminAuthToken(sessionSecret, token, c.env.DB)))
    return 'admin';
  const channelIds = collectLineLoginChannelIds(
    c.env.LINE_LOGIN_CHANNEL_ID,
    await getLineAccounts(c.env.DB, lineAccountDbOptions(c.env)),
  );
  if (await verifyLineIdToken(token, channelIds)) return 'line';
  return null;
}

function serializeSubmission(row: DbFormSubmission) {
  return {
    id: row.id,
    formId: row.form_id,
    friendId: row.friend_id,
    data: tryParseJsonRecord(row.data || '{}') ?? {},
    createdAt: row.created_at,
  };
}

// GET /api/forms — list all forms
forms.get('/api/forms', async (c) => {
  try {
    const items = await getForms(c.env.DB);
    return c.json({ success: true, data: items.map(serializeForm) });
  } catch (err) {
    console.error('GET /api/forms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/forms/:id — get form (admin session or LINE Login ID token; not anonymous)
forms.get('/api/forms/:id', async (c) => {
  try {
    const mode = await resolveFormDefinitionReader(c);
    if (!mode) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    const form = await getFormById(c.env.DB, id);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }

    // LINE Login can only fetch active forms — avoids leaking draft definitions by ID.
    if (mode === 'line' && !form.is_active) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }

    if (mode === 'admin') {
      return c.json({ success: true, data: serializeForm(form) });
    }
    return c.json({ success: true, data: serializeFormPublic(form) });
  } catch (err) {
    console.error('GET /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/forms — create form
forms.post('/api/forms', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{
      name: string;
      description?: string | null;
      fields?: unknown[];
      onSubmitTagId?: string | null;
      onSubmitScenarioId?: string | null;
      saveToMetadata?: boolean;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);

    if (!body.name) {
      return c.json({ success: false, error: 'name is required' }, 400);
    }

    const form = await createForm(c.env.DB, {
      name: body.name,
      description: body.description ?? null,
      fields: JSON.stringify(body.fields ?? []),
      onSubmitTagId: body.onSubmitTagId ?? null,
      onSubmitScenarioId: body.onSubmitScenarioId ?? null,
      saveToMetadata: body.saveToMetadata,
    });

    return c.json({ success: true, data: serializeForm(form) }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/forms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/forms/:id — update form
forms.put('/api/forms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await readJsonBodyWithLimit<{
      name?: string;
      description?: string | null;
      fields?: unknown[];
      onSubmitTagId?: string | null;
      onSubmitScenarioId?: string | null;
      saveToMetadata?: boolean;
      isActive?: boolean;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);

    const updated = await updateForm(c.env.DB, id, {
      name: body.name,
      description: body.description,
      fields: body.fields !== undefined ? JSON.stringify(body.fields) : undefined,
      onSubmitTagId: body.onSubmitTagId,
      onSubmitScenarioId: body.onSubmitScenarioId,
      saveToMetadata: body.saveToMetadata,
      isActive: body.isActive,
    });

    if (!updated) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }

    return c.json({ success: true, data: serializeForm(updated) });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/forms/:id
forms.delete('/api/forms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const form = await getFormById(c.env.DB, id);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    await deleteForm(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/forms/:id/submissions — list submissions
forms.get('/api/forms/:id/submissions', async (c) => {
  try {
    const id = c.req.param('id');
    const form = await getFormById(c.env.DB, id);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    const submissions = await getFormSubmissions(c.env.DB, id);
    return c.json({ success: true, data: submissions.map(serializeSubmission) });
  } catch (err) {
    console.error('GET /api/forms/:id/submissions error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/forms/:id/submit — submit form (public, used by LIFF)
forms.post('/api/forms/:id/submit', async (c) => {
  try {
    const limited = await enforceRateLimit(c, {
      bucket: `public-form-submit:${c.req.param('id')}`,
      db: c.env.DB,
      limit: PUBLIC_FORM_SUBMIT_RATE_LIMIT.limit,
      windowMs: PUBLIC_FORM_SUBMIT_RATE_LIMIT.windowMs,
    });
    if (limited) {
      return limited;
    }

    const body = await readJsonBodyWithLimit<{
      idToken?: string;
      data?: Record<string, unknown>;
    }>(c.req.raw, PUBLIC_FORM_SUBMIT_LIMIT_BYTES);

    const formId = c.req.param('id');
    const form = await getFormById(c.env.DB, formId);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    if (!form.is_active) {
      return c.json({ success: false, error: 'This form is no longer accepting responses' }, 400);
    }

    const submissionData = body.data ?? {};

    if (!body.idToken) {
      return c.json({ success: false, error: 'idToken is required' }, 401);
    }

    // Validate required fields
    const fields = tryParseJsonArray(form.fields || '[]') as Array<{
      name: string;
      label: string;
      type: string;
      required?: boolean;
    }>;

    for (const field of fields) {
      if (field.required) {
        const val = submissionData[field.name];
        if (val === undefined || val === null || val === '') {
          return c.json({ success: false, error: `${field.label} は必須項目です` }, 400);
        }
      }
    }

    const channelIds = collectLineLoginChannelIds(
      c.env.LINE_LOGIN_CHANNEL_ID,
      await getLineAccounts(c.env.DB, lineAccountDbOptions(c.env)),
    );
    const verified = await verifyLineIdToken(body.idToken, channelIds);
    if (!verified) {
      return c.json({ success: false, error: 'Invalid ID token' }, 401);
    }

    const friend = await getFriendByLineUserId(c.env.DB, verified.sub);
    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }
    const friendId = friend.id;

    const submission = await createFormSubmission(c.env.DB, {
      formId,
      friendId,
      data: JSON.stringify(submissionData),
    });

    // Side effects (best-effort, don't fail the request)
    const db = c.env.DB;
    const now = jstNow();
    const formSubmitFlexFooter = resolveFormSubmitFlexFooterText(c.env);

    const sideEffects: Promise<unknown>[] = [];

    // Save response data to friend's metadata
    if (form.save_to_metadata) {
      sideEffects.push(
        (async () => {
          const existingFriend = await getFriendById(db, friendId);
          if (!existingFriend) return;
          const existing = tryParseJsonRecord(existingFriend.metadata || '{}') ?? {};
          const allowedPatch = pickFormFieldValuesForMetadataMerge(
            submissionData as Record<string, unknown>,
            fields,
          );
          const merged = { ...existing, ...allowedPatch };
          await db
            .prepare(`UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?`)
            .bind(JSON.stringify(merged), now, friendId)
            .run();
        })(),
      );
    }

    // Add tag
    if (form.on_submit_tag_id) {
      sideEffects.push(addTagToFriend(db, friendId, form.on_submit_tag_id));
    }

    // Enroll in scenario
    if (form.on_submit_scenario_id) {
      sideEffects.push(enrollFriendInScenario(db, friendId, form.on_submit_scenario_id));
    }

    // Send confirmation message with submitted data back to user
    sideEffects.push(
      (async () => {
        console.log('Form reply: starting for friendId', friendId);
        const refreshedFriend = await getFriendById(db, friendId);
        if (!refreshedFriend?.line_user_id) {
          console.log('Form reply: no line_user_id');
          return;
        }
        console.log('Form reply: sending to', refreshedFriend.line_user_id);
        const { LineClient } = await import('@line-crm/line-sdk');
        const accessToken = await resolveLineAccessTokenForFriend(
          db,
          c.env.LINE_CHANNEL_ACCESS_TOKEN,
          friendId,
          lineAccountDbOptions(c.env),
        );
        const lineClient = new LineClient(accessToken);

        // Build Flex card showing their answers
        const entries = Object.entries(submissionData as Record<string, unknown>);
        const answerRows = entries.map(([key, value]) => {
          const field = (
            tryParseJsonArray(form.fields ?? '[]') as Array<{ name: string; label: string }>
          ).find((f: { name: string }) => f.name === key);
          const label = field?.label || key;
          const val = Array.isArray(value) ? value.join(', ') : String(value || '-') || '-';
          return {
            type: 'box' as const,
            layout: 'vertical' as const,
            margin: 'md' as const,
            contents: [
              { type: 'text' as const, text: label, size: 'xxs' as const, color: '#64748b' },
              {
                type: 'text' as const,
                text: val,
                size: 'sm' as const,
                color: '#1e293b',
                weight: 'bold' as const,
                wrap: true,
              },
            ],
          };
        });

        const flex = {
          type: 'bubble',
          size: 'giga',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: '診断結果', size: 'lg', weight: 'bold', color: '#1e293b' },
              {
                type: 'text',
                text: `${refreshedFriend.display_name || ''}さんのプロフィール`,
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
              ...answerRows,
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
                    text: formSubmitFlexFooter,
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

        const { buildMessage } = await import('../services/step-delivery.js');
        await lineClient.pushMessage(refreshedFriend.line_user_id, [
          buildMessage('flex', JSON.stringify(flex)),
        ]);
      })(),
    );

    if (sideEffects.length > 0) {
      const results = await Promise.allSettled(sideEffects);
      for (const r of results) {
        if (r.status === 'rejected') console.error('Form side-effect failed:', r.reason);
      }
    }

    return c.json({ success: true, data: serializeSubmission(submission) }, 201);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return c.json({ success: false, error: 'Request body too large' }, 413);
    }
    if (err instanceof InvalidJsonBodyError) {
      return c.json({ success: false, error: 'Invalid JSON body' }, 400);
    }
    console.error('POST /api/forms/:id/submit error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { forms };
