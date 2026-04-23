import { countActiveLineAccounts, createTag, deleteTag, getTagById, getTags } from '@line-crm/db';
import type { Tag as DbTag } from '@line-crm/db';
import type { LineAccountScope } from '../services/admin-line-account-scope.js';
import {
  jsonBodyForLineAccountScopeFailure,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountBody,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';

type TagId = string & { readonly __brand: 'TagId' };
type LineAccountId = string & { readonly __brand: 'LineAccountId' };

export type SerializedTag = Readonly<{
  id: TagId;
  name: string;
  color: string;
  lineAccountId: LineAccountId | null;
  createdAt: string;
}>;

export type CreateAdminTagBody = Readonly<{
  name: string;
  color?: string;
  lineAccountId?: string | null;
}>;

type TagFailure = Readonly<{ ok: false; status: 400 | 403 | 404; body: unknown }>;

function tagIdFromStorage(id: string): TagId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('tagId required');
  }
  return id.trim() as TagId;
}

function lineAccountIdFromNullable(raw: string | null | undefined): LineAccountId | null {
  if (raw == null) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : (trimmed as LineAccountId);
}

function serializeTag(row: DbTag): SerializedTag {
  return {
    id: tagIdFromStorage(row.id),
    name: row.name,
    color: row.color,
    lineAccountId: lineAccountIdFromNullable(row.line_account_id),
    createdAt: row.created_at,
  };
}

export async function listAdminTags(
  db: D1Database,
  scope: LineAccountScope,
  requestedLineAccountId: string | undefined,
): Promise<Readonly<{ ok: true; data: readonly SerializedTag[] }> | TagFailure> {
  const q = validateScopedLineAccountQueryParam(scope, requestedLineAccountId);
  if (!q.ok) {
    return { ok: false, status: q.status, body: jsonBodyForLineAccountScopeFailure(q) };
  }

  const lineAccountId = requestedLineAccountId?.trim();
  const items =
    lineAccountId && lineAccountId.length > 0
      ? await getTags(db, { lineAccountIds: [lineAccountId] })
      : await getTags(db);

  return { ok: true, data: items.map(serializeTag) };
}

export async function createAdminTag(
  db: D1Database,
  scope: LineAccountScope,
  body: CreateAdminTagBody,
): Promise<Readonly<{ ok: true; data: SerializedTag }> | TagFailure> {
  if (!body.name) {
    return { ok: false, status: 400, body: { success: false, error: 'name is required' } };
  }

  const bodyScope = validateScopedLineAccountBody(scope, body.lineAccountId);
  if (!bodyScope.ok) {
    return {
      ok: false,
      status: bodyScope.status,
      body: jsonBodyForLineAccountScopeFailure(bodyScope),
    };
  }

  if ((await countActiveLineAccounts(db)) > 1 && !bodyScope.lineAccountId) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: 'lineAccountId is required when multiple LINE accounts are active',
      },
    };
  }

  const tag = await createTag(db, {
    name: body.name,
    color: body.color,
    lineAccountId: bodyScope.lineAccountId,
  });
  return { ok: true, data: serializeTag(tag) };
}

export async function deleteAdminTag(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
): Promise<Readonly<{ ok: true; data: null }> | TagFailure> {
  const row = await getTagById(db, id);
  if (!row) {
    return { ok: false, status: 404, body: { success: false, error: 'Tag not found' } };
  }
  if (!resourceLineAccountVisibleInScope(scope, row.line_account_id)) {
    return { ok: false, status: 403, body: { success: false, error: 'Forbidden' } };
  }

  await deleteTag(db, id);
  return { ok: true, data: null };
}
