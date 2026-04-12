import {
  sealLineAccountSecretField,
  unsealLineAccountSecretField,
} from '@line-crm/shared/line-account-at-rest';
import { jstNow } from './utils.js';
// =============================================================================
// LINE Accounts — Multi-Account Management
// =============================================================================

export interface LineAccount {
  id: string;
  channel_id: string;
  name: string;
  channel_access_token: string;
  channel_secret: string;
  login_channel_id: string | null;
  login_channel_secret: string | null;
  liff_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

/** When `atRestKey` is set, sensitive columns use AES-GCM (`lh1:` prefix) at rest in D1. */
export type LineAccountDbOptions = {
  atRestKey?: Uint8Array;
};

export interface CreateLineAccountInput {
  channelId: string;
  name: string;
  channelAccessToken: string;
  channelSecret: string;
}

export type UpdateLineAccountInput = Partial<
  Pick<LineAccount, 'name' | 'channel_access_token' | 'channel_secret' | 'is_active'>
>;

async function mapLineAccountOut(
  row: LineAccount | null,
  key: Uint8Array | undefined,
): Promise<LineAccount | null> {
  if (!row) return null;
  if (!key) return row;
  return {
    ...row,
    channel_access_token: await unsealLineAccountSecretField(row.channel_access_token, key),
    channel_secret: await unsealLineAccountSecretField(row.channel_secret, key),
    login_channel_secret: row.login_channel_secret
      ? await unsealLineAccountSecretField(row.login_channel_secret, key)
      : row.login_channel_secret,
  };
}

async function sealCreateInput(
  input: CreateLineAccountInput,
  key: Uint8Array | undefined,
): Promise<CreateLineAccountInput> {
  if (!key) return input;
  return {
    ...input,
    channelAccessToken: await sealLineAccountSecretField(input.channelAccessToken, key),
    channelSecret: await sealLineAccountSecretField(input.channelSecret, key),
  };
}

async function sealUpdateInput(
  updates: UpdateLineAccountInput,
  key: Uint8Array | undefined,
): Promise<UpdateLineAccountInput> {
  if (!key) return updates;
  const out: UpdateLineAccountInput = { ...updates };
  if (updates.channel_access_token !== undefined) {
    out.channel_access_token = await sealLineAccountSecretField(updates.channel_access_token, key);
  }
  if (updates.channel_secret !== undefined) {
    out.channel_secret = await sealLineAccountSecretField(updates.channel_secret, key);
  }
  return out;
}

export async function createLineAccount(
  db: D1Database,
  input: CreateLineAccountInput,
  options?: LineAccountDbOptions,
): Promise<LineAccount> {
  const key = options?.atRestKey;
  const sealed = await sealCreateInput(input, key);
  const id = crypto.randomUUID();
  const now = jstNow();

  await db
    .prepare(
      `INSERT INTO line_accounts (id, channel_id, name, channel_access_token, channel_secret, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      id,
      sealed.channelId,
      sealed.name,
      sealed.channelAccessToken,
      sealed.channelSecret,
      now,
      now,
    )
    .run();

  return (await getLineAccountById(db, id, options))!;
}

export async function getLineAccountById(
  db: D1Database,
  id: string,
  options?: LineAccountDbOptions,
): Promise<LineAccount | null> {
  const row = await db
    .prepare(`SELECT * FROM line_accounts WHERE id = ?`)
    .bind(id)
    .first<LineAccount>();
  return mapLineAccountOut(row, options?.atRestKey);
}

export async function getLineAccounts(
  db: D1Database,
  options?: LineAccountDbOptions,
): Promise<LineAccount[]> {
  const result = await db
    .prepare(`SELECT * FROM line_accounts ORDER BY created_at DESC`)
    .all<LineAccount>();
  const key = options?.atRestKey;
  const out: LineAccount[] = [];
  for (const row of result.results) {
    out.push((await mapLineAccountOut(row, key))!);
  }
  return out;
}

export async function getLineAccountByChannelId(
  db: D1Database,
  channelId: string,
  options?: LineAccountDbOptions,
): Promise<LineAccount | null> {
  const row = await db
    .prepare(`SELECT * FROM line_accounts WHERE channel_id = ?`)
    .bind(channelId)
    .first<LineAccount>();
  return mapLineAccountOut(row, options?.atRestKey);
}

export async function updateLineAccount(
  db: D1Database,
  id: string,
  updates: UpdateLineAccountInput,
  options?: LineAccountDbOptions,
): Promise<LineAccount | null> {
  const key = options?.atRestKey;
  const sealed = await sealUpdateInput(updates, key);
  const fields: string[] = [];
  const values: unknown[] = [];

  if (sealed.name !== undefined) {
    fields.push('name = ?');
    values.push(sealed.name);
  }
  if (sealed.channel_access_token !== undefined) {
    fields.push('channel_access_token = ?');
    values.push(sealed.channel_access_token);
  }
  if (sealed.channel_secret !== undefined) {
    fields.push('channel_secret = ?');
    values.push(sealed.channel_secret);
  }
  if (sealed.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(sealed.is_active);
  }

  if (fields.length === 0) return getLineAccountById(db, id, options);

  fields.push('updated_at = ?');
  values.push(jstNow());
  values.push(id);

  await db
    .prepare(`UPDATE line_accounts SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return getLineAccountById(db, id, options);
}

export async function deleteLineAccount(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM line_accounts WHERE id = ?`).bind(id).run();
}
