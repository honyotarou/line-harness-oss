import {
  claimBroadcastForSending,
  createBroadcast,
  deleteBroadcast,
  getBroadcastById,
  getBroadcasts,
  updateBroadcast,
} from '@line-crm/db';
import type {
  Broadcast as DbBroadcast,
  BroadcastMessageType,
  BroadcastTargetType,
} from '@line-crm/db';
import { createLineClient } from '@line-crm/line-sdk';
import type { Env } from '../index.js';
import type { LineAccountScope } from '../services/admin-line-account-scope.js';
import {
  jsonBodyForLineAccountScopeFailure,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountBody,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';
import { lineAccountDbOptions } from '../services/line-account-at-rest-key.js';
import { resolveLineAccessTokenForLineAccountId } from '../services/line-account-routing.js';
import { processBroadcastSend } from '../services/broadcast.js';
import { processSegmentSend } from '../services/segment-send.js';
import type { SegmentCondition } from '../services/segment-query.js';

type WorkerBindings = Env['Bindings'];

type BroadcastId = string & { readonly __brand: 'BroadcastId' };
type LineAccountId = string & { readonly __brand: 'LineAccountId' };
type TagId = string & { readonly __brand: 'TagId' };

export type SerializedBroadcast = Readonly<{
  id: BroadcastId;
  title: string;
  messageType: BroadcastMessageType;
  messageContent: string;
  targetType: BroadcastTargetType;
  targetTagId: TagId | null;
  status: DbBroadcast['status'];
  lineAccountId: LineAccountId | null;
  scheduledAt: string | null;
  sentAt: string | null;
  totalCount: number;
  successCount: number;
  createdAt: string;
}>;

export type CreateAdminBroadcastBody = Readonly<{
  title: string;
  messageType: BroadcastMessageType;
  messageContent: string;
  targetType: BroadcastTargetType;
  targetTagId?: string | null;
  scheduledAt?: string | null;
  lineAccountId?: string | null;
}>;

export type UpdateAdminBroadcastBody = Readonly<{
  title?: string;
  messageType?: BroadcastMessageType;
  messageContent?: string;
  targetType?: BroadcastTargetType;
  targetTagId?: string | null;
  scheduledAt?: string | null;
}>;

export type SendSegmentBroadcastBody = Readonly<{
  conditions?: SegmentCondition;
}>;

type BroadcastFailure = Readonly<{ ok: false; status: 400 | 403 | 404 | 502; body: unknown }>;

function broadcastIdFromStorage(id: string): BroadcastId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('broadcastId required');
  }
  return id.trim() as BroadcastId;
}

function lineAccountIdFromNullable(raw: string | null | undefined): LineAccountId | null {
  if (raw == null) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : (trimmed as LineAccountId);
}

function tagIdFromNullable(raw: string | null | undefined): TagId | null {
  if (raw == null) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : (trimmed as TagId);
}

function serializeBroadcast(row: DbBroadcast): SerializedBroadcast {
  return {
    id: broadcastIdFromStorage(row.id),
    title: row.title,
    messageType: row.message_type,
    messageContent: row.message_content,
    targetType: row.target_type,
    targetTagId: tagIdFromNullable(row.target_tag_id),
    status: row.status,
    lineAccountId: lineAccountIdFromNullable(row.line_account_id),
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    totalCount: row.total_count,
    successCount: row.success_count,
    createdAt: row.created_at,
  };
}

function broadcastNotFoundFailure(): BroadcastFailure {
  return { ok: false, status: 404, body: { success: false, error: 'Broadcast not found' } };
}

async function getScopedBroadcast(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
): Promise<Readonly<{ ok: true; data: DbBroadcast }> | BroadcastFailure> {
  const broadcast = await getBroadcastById(db, id);
  if (!broadcast) {
    return broadcastNotFoundFailure();
  }
  if (!resourceLineAccountVisibleInScope(scope, broadcast.line_account_id)) {
    return broadcastNotFoundFailure();
  }
  return { ok: true, data: broadcast };
}

export async function listAdminBroadcasts(
  db: D1Database,
  scope: LineAccountScope,
  requestedLineAccountId: string | undefined,
): Promise<Readonly<{ ok: true; data: readonly SerializedBroadcast[] }> | BroadcastFailure> {
  const q = validateScopedLineAccountQueryParam(scope, requestedLineAccountId);
  if (!q.ok) {
    return { ok: false, status: q.status, body: jsonBodyForLineAccountScopeFailure(q) };
  }

  const normalizedLineAccountId = requestedLineAccountId?.trim();
  const items =
    normalizedLineAccountId && normalizedLineAccountId.length > 0
      ? (
          await db
            .prepare(`SELECT * FROM broadcasts WHERE line_account_id = ? ORDER BY created_at DESC`)
            .bind(normalizedLineAccountId)
            .all<DbBroadcast>()
        ).results
      : await getBroadcasts(db);
  return { ok: true, data: items.map(serializeBroadcast) };
}

export async function getAdminBroadcast(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
): Promise<Readonly<{ ok: true; data: SerializedBroadcast }> | BroadcastFailure> {
  const scoped = await getScopedBroadcast(db, scope, id);
  if (!scoped.ok) {
    return scoped;
  }
  return { ok: true, data: serializeBroadcast(scoped.data) };
}

export async function createAdminBroadcast(
  db: D1Database,
  scope: LineAccountScope,
  body: CreateAdminBroadcastBody,
): Promise<Readonly<{ ok: true; data: SerializedBroadcast }> | BroadcastFailure> {
  if (!body.title || !body.messageType || !body.messageContent || !body.targetType) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: 'title, messageType, messageContent, and targetType are required',
      },
    };
  }

  if (body.targetType === 'tag' && !body.targetTagId) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'targetTagId is required when targetType is "tag"' },
    };
  }

  const scopedLineAccount = validateScopedLineAccountBody(scope, body.lineAccountId);
  if (!scopedLineAccount.ok) {
    return {
      ok: false,
      status: scopedLineAccount.status,
      body: jsonBodyForLineAccountScopeFailure(scopedLineAccount),
    };
  }

  const created = await createBroadcast(db, {
    title: body.title,
    messageType: body.messageType,
    messageContent: body.messageContent,
    targetType: body.targetType,
    targetTagId: body.targetTagId ?? null,
    scheduledAt: body.scheduledAt ?? null,
  });

  if (scopedLineAccount.lineAccountId) {
    await db
      .prepare('UPDATE broadcasts SET line_account_id = ? WHERE id = ?')
      .bind(scopedLineAccount.lineAccountId, created.id)
      .run();
  }

  return {
    ok: true,
    data: serializeBroadcast({
      ...created,
      line_account_id: scopedLineAccount.lineAccountId ?? created.line_account_id,
    }),
  };
}

export async function updateAdminBroadcast(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
  body: UpdateAdminBroadcastBody,
): Promise<Readonly<{ ok: true; data: SerializedBroadcast | null }> | BroadcastFailure> {
  const scoped = await getScopedBroadcast(db, scope, id);
  if (!scoped.ok) {
    return scoped;
  }

  if (scoped.data.status !== 'draft' && scoped.data.status !== 'scheduled') {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'Only draft or scheduled broadcasts can be updated' },
    };
  }

  const statusUpdate =
    body.scheduledAt !== undefined ? (body.scheduledAt ? 'scheduled' : 'draft') : undefined;
  const updated = await updateBroadcast(db, id, {
    title: body.title,
    message_type: body.messageType,
    message_content: body.messageContent,
    target_type: body.targetType,
    target_tag_id: body.targetTagId,
    scheduled_at: body.scheduledAt,
    ...(statusUpdate !== undefined ? { status: statusUpdate } : {}),
  });

  return { ok: true, data: updated ? serializeBroadcast(updated) : null };
}

export async function deleteAdminBroadcast(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
): Promise<Readonly<{ ok: true; data: null }> | BroadcastFailure> {
  const scoped = await getScopedBroadcast(db, scope, id);
  if (!scoped.ok) {
    return scoped;
  }

  await deleteBroadcast(db, id);
  return { ok: true, data: null };
}

export async function sendAdminBroadcastNow(
  db: D1Database,
  env: WorkerBindings,
  scope: LineAccountScope,
  id: string,
): Promise<Readonly<{ ok: true; data: SerializedBroadcast | null }> | BroadcastFailure> {
  const scoped = await getScopedBroadcast(db, scope, id);
  if (!scoped.ok) {
    return scoped;
  }

  const claimed = await claimBroadcastForSending(db, id);
  if (!claimed) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'Broadcast is already sent or sending' },
    };
  }

  const accessToken = await resolveLineAccessTokenForLineAccountId(
    db,
    env.LINE_CHANNEL_ACCESS_TOKEN,
    scoped.data.line_account_id,
    lineAccountDbOptions(env),
  );
  const lineClient = createLineClient(accessToken);
  await processBroadcastSend(db, lineClient, id, { skipMarkSending: true });

  const result = await getBroadcastById(db, id);
  if (result && result.status !== 'sent') {
    return {
      ok: false,
      status: 502,
      body: {
        success: false,
        error: 'Broadcast delivery failed',
        data: serializeBroadcast(result),
      },
    };
  }

  return { ok: true, data: result ? serializeBroadcast(result) : null };
}

export async function sendAdminBroadcastSegment(
  db: D1Database,
  env: WorkerBindings,
  scope: LineAccountScope,
  id: string,
  body: SendSegmentBroadcastBody,
): Promise<Readonly<{ ok: true; data: SerializedBroadcast | null }> | BroadcastFailure> {
  const scoped = await getScopedBroadcast(db, scope, id);
  if (!scoped.ok) {
    return scoped;
  }

  if (!body.conditions || !body.conditions.operator || !Array.isArray(body.conditions.rules)) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'conditions with operator and rules array is required' },
    };
  }

  const claimed = await claimBroadcastForSending(db, id);
  if (!claimed) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'Broadcast is already sent or sending' },
    };
  }

  const accessToken = await resolveLineAccessTokenForLineAccountId(
    db,
    env.LINE_CHANNEL_ACCESS_TOKEN,
    scoped.data.line_account_id,
    lineAccountDbOptions(env),
  );
  const lineClient = createLineClient(accessToken);
  await processSegmentSend(db, lineClient, id, body.conditions, { skipMarkSending: true });

  const result = await getBroadcastById(db, id);
  return { ok: true, data: result ? serializeBroadcast(result) : null };
}
