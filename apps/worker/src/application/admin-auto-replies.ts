import type { AutoReply, UpdateAutoReplyInput } from '@line-crm/db';
import {
  countActiveLineAccounts,
  createAutoReply,
  deleteAutoReply,
  getAutoReplies,
  getAutoReplyById,
  updateAutoReply,
} from '@line-crm/db';
import type { AutoReplyId, LineAccountId } from '@line-crm/shared';
import { autoReplyIdFromStorage, lineAccountIdFromNullable } from '@line-crm/shared';
import type { LineAccountScope } from '../services/admin-line-account-scope.js';
import {
  jsonBodyForLineAccountScopeFailure,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountBody,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';

export type SerializedAutoReply = Readonly<{
  id: AutoReplyId;
  keyword: string;
  matchType: string;
  responseType: string;
  responseContent: string;
  lineAccountId: LineAccountId | null;
  isActive: boolean;
  createdAt: string;
}>;

export function serializeAutoReplyForApi(row: AutoReply): SerializedAutoReply {
  return {
    id: autoReplyIdFromStorage(row.id),
    keyword: row.keyword,
    matchType: row.match_type,
    responseType: row.response_type,
    responseContent: row.response_content,
    lineAccountId: lineAccountIdFromNullable(row.line_account_id),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

async function assertExplicitLineAccountWhenMultiTenant(
  db: D1Database,
  lineAccountId: string | null,
): Promise<Readonly<{ ok: true }> | Readonly<{ ok: false; status: 400; body: unknown }>> {
  if (lineAccountId != null && lineAccountId.trim().length > 0) {
    return { ok: true };
  }
  if ((await countActiveLineAccounts(db)) > 1) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error:
          'lineAccountId is required when multiple active LINE accounts are configured (global auto-replies are disabled)',
      },
    };
  }
  return { ok: true };
}

type ScopeFail = Readonly<{ ok: false; status: 400 | 403; body: unknown }>;

export async function adminListAutoReplies(
  db: D1Database,
  scope: LineAccountScope,
  accountIdQuery: string | undefined,
): Promise<Readonly<{ ok: true; data: SerializedAutoReply[] }> | ScopeFail> {
  const qv = validateScopedLineAccountQueryParam(scope, accountIdQuery ?? null);
  if (!qv.ok) {
    return { ok: false, status: qv.status, body: jsonBodyForLineAccountScopeFailure(qv) };
  }
  const items = await getAutoReplies(db, accountIdQuery);
  const filtered = items.filter((row) =>
    resourceLineAccountVisibleInScope(scope, row.line_account_id),
  );
  return { ok: true, data: filtered.map(serializeAutoReplyForApi) };
}

export async function adminGetAutoReplyById(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
): Promise<
  | Readonly<{ ok: true; data: SerializedAutoReply }>
  | Readonly<{ ok: false; status: 404; body: unknown }>
> {
  const item = await getAutoReplyById(db, id);
  if (!item || !resourceLineAccountVisibleInScope(scope, item.line_account_id)) {
    return { ok: false, status: 404, body: { success: false, error: 'Auto-reply not found' } };
  }
  return { ok: true, data: serializeAutoReplyForApi(item) };
}

export async function adminCreateAutoReply(
  db: D1Database,
  scope: LineAccountScope,
  input: Readonly<{
    keyword: string;
    matchType?: 'exact' | 'contains';
    responseType?: string;
    responseContent: string;
    lineAccountId?: string | null;
  }>,
): Promise<
  | Readonly<{ ok: true; data: SerializedAutoReply }>
  | ScopeFail
  | Readonly<{ ok: false; status: 400; body: unknown }>
> {
  const acc = validateScopedLineAccountBody(scope, input.lineAccountId);
  if (!acc.ok) {
    return { ok: false, status: acc.status, body: jsonBodyForLineAccountScopeFailure(acc) };
  }
  const gate = await assertExplicitLineAccountWhenMultiTenant(db, acc.lineAccountId);
  if (!gate.ok) {
    return { ok: false, status: gate.status, body: gate.body };
  }
  const item = await createAutoReply(db, {
    keyword: input.keyword.trim(),
    matchType: input.matchType,
    responseType: input.responseType,
    responseContent: input.responseContent.trim(),
    lineAccountId: acc.lineAccountId,
  });
  return { ok: true, data: serializeAutoReplyForApi(item) };
}

export async function adminUpdateAutoReply(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
  body: Readonly<{
    keyword?: string;
    matchType?: 'exact' | 'contains';
    responseType?: string;
    responseContent?: string;
    lineAccountId?: string | null;
    isActive?: boolean;
  }>,
): Promise<
  | Readonly<{ ok: true; data: SerializedAutoReply }>
  | Readonly<{ ok: false; status: 404; body: unknown }>
  | ScopeFail
  | Readonly<{ ok: false; status: 400; body: unknown }>
> {
  const existing = await getAutoReplyById(db, id);
  if (!existing || !resourceLineAccountVisibleInScope(scope, existing.line_account_id)) {
    return { ok: false, status: 404, body: { success: false, error: 'Auto-reply not found' } };
  }
  const mergedLineAccountId =
    'lineAccountId' in body ? (body.lineAccountId ?? null) : existing.line_account_id;
  const acc = validateScopedLineAccountBody(scope, mergedLineAccountId);
  if (!acc.ok) {
    return { ok: false, status: acc.status, body: jsonBodyForLineAccountScopeFailure(acc) };
  }
  const gate = await assertExplicitLineAccountWhenMultiTenant(db, acc.lineAccountId);
  if (!gate.ok) {
    return { ok: false, status: gate.status, body: gate.body };
  }
  const patch: UpdateAutoReplyInput = {};
  if (body.keyword !== undefined) patch.keyword = body.keyword;
  if (body.matchType !== undefined) patch.matchType = body.matchType;
  if (body.responseType !== undefined) patch.responseType = body.responseType;
  if (body.responseContent !== undefined) patch.responseContent = body.responseContent;
  if ('lineAccountId' in body) patch.lineAccountId = acc.lineAccountId;
  if (body.isActive !== undefined) patch.isActive = body.isActive;

  const updated = await updateAutoReply(db, id, patch);
  if (!updated) {
    return { ok: false, status: 404, body: { success: false, error: 'Auto-reply not found' } };
  }
  return { ok: true, data: serializeAutoReplyForApi(updated) };
}

export async function adminDeleteAutoReply(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
): Promise<
  Readonly<{ ok: true; data: null }> | Readonly<{ ok: false; status: 404; body: unknown }>
> {
  const item = await getAutoReplyById(db, id);
  if (!item || !resourceLineAccountVisibleInScope(scope, item.line_account_id)) {
    return { ok: false, status: 404, body: { success: false, error: 'Auto-reply not found' } };
  }
  await deleteAutoReply(db, id);
  return { ok: true, data: null };
}
