import { jstNow } from './utils.js';
import {
  sealLineAccountSecretField,
  unsealLineAccountSecretField,
} from '@line-crm/shared/line-account-at-rest';
// Webhook IN/OUT クエリヘルパー

export type IncomingWebhookRow = Readonly<{
  id: string;
  name: string;
  source_type: string;
  secret: string;
  line_account_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}>;

export type OutgoingWebhookRow = Readonly<{
  id: string;
  name: string;
  url: string;
  event_types: string; // JSON配列
  secret: string;
  line_account_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}>;

export type WebhookSecretsDbOptions = Readonly<{
  /** When set, webhook secrets use AES-GCM (`lh1:` prefix) at rest in D1. */
  atRestKey?: Uint8Array;
}>;

async function maybeUnsealIncoming(
  row: IncomingWebhookRow,
  key: Uint8Array | undefined,
): Promise<IncomingWebhookRow> {
  if (!key) return row;
  return {
    ...row,
    secret: await unsealLineAccountSecretField(row.secret, key),
  };
}

async function maybeUnsealOutgoing(
  row: OutgoingWebhookRow,
  key: Uint8Array | undefined,
): Promise<OutgoingWebhookRow> {
  if (!key) return row;
  return {
    ...row,
    secret: await unsealLineAccountSecretField(row.secret, key),
  };
}

async function maybeSealSecret(secret: string, key: Uint8Array | undefined): Promise<string> {
  if (!key) return secret;
  return sealLineAccountSecretField(secret, key);
}

// --- 受信Webhook ---

export async function getIncomingWebhooks(
  db: D1Database,
  opts: { lineAccountId?: string | null } = {},
  options?: WebhookSecretsDbOptions,
): Promise<IncomingWebhookRow[]> {
  const id = opts.lineAccountId?.trim();
  const stmt = id
    ? db
        .prepare(
          `SELECT * FROM incoming_webhooks WHERE line_account_id = ? ORDER BY created_at DESC`,
        )
        .bind(id)
    : db.prepare(
        `SELECT * FROM incoming_webhooks WHERE line_account_id IS NULL ORDER BY created_at DESC`,
      );
  const result = await stmt.all<IncomingWebhookRow>();
  const key = options?.atRestKey;
  return await Promise.all(result.results.map((r) => maybeUnsealIncoming(r, key)));
}

export async function getIncomingWebhookById(
  db: D1Database,
  id: string,
  options?: WebhookSecretsDbOptions,
): Promise<IncomingWebhookRow | null> {
  const row = await db
    .prepare(`SELECT * FROM incoming_webhooks WHERE id = ?`)
    .bind(id)
    .first<IncomingWebhookRow>();
  if (!row) return null;
  return await maybeUnsealIncoming(row, options?.atRestKey);
}

export async function createIncomingWebhook(
  db: D1Database,
  input: { name: string; sourceType?: string; secret: string; lineAccountId?: string | null },
  options?: WebhookSecretsDbOptions,
): Promise<IncomingWebhookRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  const sealedSecret = await maybeSealSecret(input.secret, options?.atRestKey);
  await db
    .prepare(
      `INSERT INTO incoming_webhooks (id, name, source_type, secret, line_account_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.sourceType ?? 'custom',
      sealedSecret,
      input.lineAccountId?.trim() || null,
      now,
      now,
    )
    .run();
  return (await getIncomingWebhookById(db, id, options))!;
}

export async function updateIncomingWebhook(
  db: D1Database,
  id: string,
  updates: Partial<{
    name: string;
    sourceType: string;
    secret: string;
    lineAccountId: string | null;
    isActive: boolean;
  }>,
  options?: WebhookSecretsDbOptions,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.sourceType !== undefined) {
    sets.push('source_type = ?');
    values.push(updates.sourceType);
  }
  if (updates.secret !== undefined) {
    sets.push('secret = ?');
    values.push(await maybeSealSecret(updates.secret, options?.atRestKey));
  }
  if (updates.lineAccountId !== undefined) {
    sets.push('line_account_id = ?');
    const v = updates.lineAccountId;
    values.push(typeof v === 'string' && v.trim() ? v.trim() : null);
  }
  if (updates.isActive !== undefined) {
    sets.push('is_active = ?');
    values.push(updates.isActive ? 1 : 0);
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  values.push(jstNow());
  values.push(id);
  await db
    .prepare(`UPDATE incoming_webhooks SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function deleteIncomingWebhook(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM incoming_webhooks WHERE id = ?`).bind(id).run();
}

// --- 送信Webhook ---

export async function getOutgoingWebhooks(
  db: D1Database,
  options?: WebhookSecretsDbOptions,
): Promise<OutgoingWebhookRow[]> {
  const result = await db
    .prepare(`SELECT * FROM outgoing_webhooks ORDER BY created_at DESC`)
    .all<OutgoingWebhookRow>();
  const key = options?.atRestKey;
  return await Promise.all(result.results.map((r) => maybeUnsealOutgoing(r, key)));
}

export async function getOutgoingWebhookById(
  db: D1Database,
  id: string,
  options?: WebhookSecretsDbOptions,
): Promise<OutgoingWebhookRow | null> {
  const row = await db
    .prepare(`SELECT * FROM outgoing_webhooks WHERE id = ?`)
    .bind(id)
    .first<OutgoingWebhookRow>();
  if (!row) return null;
  return await maybeUnsealOutgoing(row, options?.atRestKey);
}

export async function createOutgoingWebhook(
  db: D1Database,
  input: {
    name: string;
    url: string;
    eventTypes: string[];
    secret: string;
    lineAccountId?: string | null;
  },
  options?: WebhookSecretsDbOptions,
): Promise<OutgoingWebhookRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  const sealedSecret = await maybeSealSecret(input.secret, options?.atRestKey);
  await db
    .prepare(
      `INSERT INTO outgoing_webhooks (id, name, url, event_types, secret, line_account_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.url,
      JSON.stringify(input.eventTypes),
      sealedSecret,
      input.lineAccountId?.trim() || null,
      now,
      now,
    )
    .run();
  return (await getOutgoingWebhookById(db, id, options))!;
}

export async function updateOutgoingWebhook(
  db: D1Database,
  id: string,
  updates: Partial<{
    name: string;
    url: string;
    eventTypes: string[];
    secret: string;
    lineAccountId: string | null;
    isActive: boolean;
  }>,
  options?: WebhookSecretsDbOptions,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.url !== undefined) {
    sets.push('url = ?');
    values.push(updates.url);
  }
  if (updates.eventTypes !== undefined) {
    sets.push('event_types = ?');
    values.push(JSON.stringify(updates.eventTypes));
  }
  if (updates.secret !== undefined) {
    sets.push('secret = ?');
    values.push(await maybeSealSecret(updates.secret, options?.atRestKey));
  }
  if (updates.lineAccountId !== undefined) {
    sets.push('line_account_id = ?');
    const v = updates.lineAccountId;
    values.push(typeof v === 'string' && v.trim() ? v.trim() : null);
  }
  if (updates.isActive !== undefined) {
    sets.push('is_active = ?');
    values.push(updates.isActive ? 1 : 0);
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  values.push(jstNow());
  values.push(id);
  await db
    .prepare(`UPDATE outgoing_webhooks SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function deleteOutgoingWebhook(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM outgoing_webhooks WHERE id = ?`).bind(id).run();
}

/** 指定イベントタイプに一致するアクティブな送信Webhookを取得 */
export async function getActiveOutgoingWebhooksByEvent(
  db: D1Database,
  eventType: string,
): Promise<OutgoingWebhookRow[]> {
  const all = await db
    .prepare(`SELECT * FROM outgoing_webhooks WHERE is_active = 1`)
    .all<OutgoingWebhookRow>();
  return all.results.filter((w) => {
    const types: string[] = JSON.parse(w.event_types);
    return types.includes(eventType) || types.includes('*');
  });
}
