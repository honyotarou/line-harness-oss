import {
  createForm,
  deleteForm,
  getFormById,
  getFormSubmissions,
  getForms,
  getLineAccounts,
  updateForm,
} from '@line-crm/db';
import type { Form as DbForm, FormSubmission as DbFormSubmission } from '@line-crm/db';
import type { Env } from '../index.js';
import { isValidAdminAuthToken, resolveAdminSessionSecret } from '../services/admin-session.js';
import {
  deepEscapeHtmlStringLeaves,
  escapeHtmlTextForJsonApi,
} from '../services/api-json-sanitizer.js';
import { lineAccountDbOptions } from '../services/line-account-at-rest-key.js';
import { collectLineLoginChannelIds, verifyLineIdToken } from '../services/line-id-token.js';
import { tryParseJsonArray, tryParseJsonRecord } from '../services/safe-json.js';

export type FormReaderMode = 'admin' | 'line';

export type FormFieldDefinition = Readonly<{
  name: string;
  label: string;
  type: string;
  required?: boolean;
  options?: readonly string[];
}>;

export type SerializedAdminForm = Readonly<{
  id: FormId;
  name: string;
  description: string | null;
  fields: readonly unknown[];
  onSubmitTagId: string | null;
  onSubmitScenarioId: string | null;
  saveToMetadata: boolean;
  isActive: boolean;
  submitCount: number;
  createdAt: string;
  updatedAt: string;
}>;

export type SerializedPublicForm = Readonly<{
  id: FormId;
  name: string;
  description: string | null;
  fields: readonly unknown[];
  isActive: boolean;
}>;

export type SerializedFormSubmission = Readonly<{
  id: FormSubmissionId;
  formId: FormId;
  friendId: string | null;
  data: Readonly<Record<string, unknown>>;
  createdAt: string;
}>;

type FormFailure = Readonly<{ ok: false; status: 400 | 401 | 404; body: unknown }>;

type FormResult<T> = Readonly<{ ok: true; data: T }> | FormFailure;
type FormId = string & { readonly __brand: 'FormId' };
type FormSubmissionId = string & { readonly __brand: 'FormSubmissionId' };
type WorkerBindings = Env['Bindings'];

export type CreateAdminFormBody = Readonly<{
  name: string;
  description?: string | null;
  fields?: readonly unknown[];
  onSubmitTagId?: string | null;
  onSubmitScenarioId?: string | null;
  saveToMetadata?: boolean;
}>;

export type UpdateAdminFormBody = Readonly<{
  name?: string;
  description?: string | null;
  fields?: readonly unknown[];
  onSubmitTagId?: string | null;
  onSubmitScenarioId?: string | null;
  saveToMetadata?: boolean;
  isActive?: boolean;
}>;

function formIdFromStorage(id: string): FormId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('formId required');
  }
  return id.trim() as FormId;
}

function formSubmissionIdFromStorage(id: string): FormSubmissionId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('formSubmissionId required');
  }
  return id.trim() as FormSubmissionId;
}

function parseFormFields(fieldsJson: string): readonly unknown[] {
  return deepEscapeHtmlStringLeaves(tryParseJsonArray(fieldsJson || '[]')) as readonly unknown[];
}

export function parseFormFieldDefinitions(fieldsJson: string): readonly FormFieldDefinition[] {
  return (tryParseJsonArray(fieldsJson || '[]') as FormFieldDefinition[]) ?? [];
}

export function serializeAdminForm(row: DbForm): SerializedAdminForm {
  return {
    id: formIdFromStorage(row.id),
    name: escapeHtmlTextForJsonApi(row.name),
    description: row.description ? escapeHtmlTextForJsonApi(row.description) : null,
    fields: parseFormFields(row.fields || '[]'),
    onSubmitTagId: row.on_submit_tag_id,
    onSubmitScenarioId: row.on_submit_scenario_id,
    saveToMetadata: Boolean(row.save_to_metadata),
    isActive: Boolean(row.is_active),
    submitCount: row.submit_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializePublicForm(row: DbForm): SerializedPublicForm {
  return {
    id: formIdFromStorage(row.id),
    name: escapeHtmlTextForJsonApi(row.name),
    description: row.description ? escapeHtmlTextForJsonApi(row.description) : null,
    fields: parseFormFields(row.fields || '[]'),
    isActive: Boolean(row.is_active),
  };
}

export function serializeFormSubmission(row: DbFormSubmission): SerializedFormSubmission {
  const dataRaw = tryParseJsonRecord(row.data || '{}') ?? {};
  return {
    id: formSubmissionIdFromStorage(row.id),
    formId: formIdFromStorage(row.form_id),
    friendId: row.friend_id,
    data: deepEscapeHtmlStringLeaves(dataRaw) as Readonly<Record<string, unknown>>,
    createdAt: row.created_at,
  };
}

export async function resolveFormDefinitionReader(
  input: Readonly<{
    db: D1Database;
    env: WorkerBindings;
    token: string | null;
  }>,
): Promise<FormReaderMode | null> {
  const token = input.token?.trim() ?? '';
  if (!token) {
    return null;
  }

  const sessionSecret = resolveAdminSessionSecret(input.env);
  if (sessionSecret && (await isValidAdminAuthToken(sessionSecret, token, input.db))) {
    return 'admin';
  }

  const channelIds = collectLineLoginChannelIds(
    input.env.LINE_LOGIN_CHANNEL_ID,
    await getLineAccounts(input.db, lineAccountDbOptions(input.env)),
  );
  const verified = await verifyLineIdToken(token, channelIds);
  if (!verified) {
    return null;
  }
  return 'line';
}

export async function listAdminForms(
  db: D1Database,
): Promise<Readonly<{ ok: true; data: readonly SerializedAdminForm[] }>> {
  const items = await getForms(db);
  return { ok: true, data: items.map(serializeAdminForm) };
}

export async function getFormForReader(
  db: D1Database,
  formId: string,
  mode: FormReaderMode,
): Promise<FormResult<SerializedAdminForm | SerializedPublicForm>> {
  const form = await getFormById(db, formId);
  if (!form) {
    return { ok: false, status: 404, body: { success: false, error: 'Form not found' } };
  }
  if (mode === 'line' && !form.is_active) {
    return { ok: false, status: 404, body: { success: false, error: 'Form not found' } };
  }
  return {
    ok: true,
    data: mode === 'admin' ? serializeAdminForm(form) : serializePublicForm(form),
  };
}

export async function createAdminFormRecord(
  db: D1Database,
  body: CreateAdminFormBody,
): Promise<FormResult<SerializedAdminForm>> {
  if (!body.name) {
    return { ok: false, status: 400, body: { success: false, error: 'name is required' } };
  }

  const form = await createForm(db, {
    name: body.name,
    description: body.description ?? null,
    fields: JSON.stringify(body.fields ?? []),
    onSubmitTagId: body.onSubmitTagId ?? null,
    onSubmitScenarioId: body.onSubmitScenarioId ?? null,
    saveToMetadata: body.saveToMetadata,
  });
  return { ok: true, data: serializeAdminForm(form) };
}

export async function updateAdminFormRecord(
  db: D1Database,
  formId: string,
  body: UpdateAdminFormBody,
): Promise<FormResult<SerializedAdminForm>> {
  const updated = await updateForm(db, formId, {
    name: body.name,
    description: body.description,
    fields: body.fields !== undefined ? JSON.stringify(body.fields) : undefined,
    onSubmitTagId: body.onSubmitTagId,
    onSubmitScenarioId: body.onSubmitScenarioId,
    saveToMetadata: body.saveToMetadata,
    isActive: body.isActive,
  });

  if (!updated) {
    return { ok: false, status: 404, body: { success: false, error: 'Form not found' } };
  }

  return { ok: true, data: serializeAdminForm(updated) };
}

export async function deleteAdminFormRecord(
  db: D1Database,
  formId: string,
): Promise<Readonly<{ ok: true; data: null }> | FormFailure> {
  const form = await getFormById(db, formId);
  if (!form) {
    return { ok: false, status: 404, body: { success: false, error: 'Form not found' } };
  }

  await deleteForm(db, formId);
  return { ok: true, data: null };
}

export async function listAdminFormSubmissions(
  db: D1Database,
  formId: string,
): Promise<FormResult<readonly SerializedFormSubmission[]>> {
  const form = await getFormById(db, formId);
  if (!form) {
    return { ok: false, status: 404, body: { success: false, error: 'Form not found' } };
  }

  const submissions = await getFormSubmissions(db, formId);
  return { ok: true, data: submissions.map(serializeFormSubmission) };
}
