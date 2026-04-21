import { jstNow } from './utils.js';

export type AdPlatformProvider = 'meta' | 'google' | 'tiktok' | 'x';

export type AdPlatformConnectionRow = Readonly<{
  id: string;
  provider: AdPlatformProvider;
  name: string;
  line_account_id: string | null;
  external_account_ref: string | null;
  credentials_enc: string | null;
  metadata_json: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}>;

export async function listAdPlatformConnections(
  db: D1Database,
  lineAccountId?: string | null,
): Promise<AdPlatformConnectionRow[]> {
  if (lineAccountId) {
    const r = await db
      .prepare(
        `SELECT * FROM ad_platform_connections WHERE line_account_id = ? ORDER BY created_at DESC`,
      )
      .bind(lineAccountId)
      .all<AdPlatformConnectionRow>();
    return r.results;
  }
  const r = await db
    .prepare(`SELECT * FROM ad_platform_connections ORDER BY created_at DESC`)
    .all<AdPlatformConnectionRow>();
  return r.results;
}

export async function getAdPlatformConnectionById(
  db: D1Database,
  id: string,
): Promise<AdPlatformConnectionRow | null> {
  return db
    .prepare(`SELECT * FROM ad_platform_connections WHERE id = ?`)
    .bind(id)
    .first<AdPlatformConnectionRow>();
}

export type CreateAdPlatformConnectionInput = Readonly<{
  provider: AdPlatformProvider;
  name: string;
  lineAccountId?: string | null;
  externalAccountRef?: string | null;
  credentialsEnc?: string | null;
  metadataJson?: string;
}>;

export async function createAdPlatformConnection(
  db: D1Database,
  input: CreateAdPlatformConnectionInput,
): Promise<AdPlatformConnectionRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO ad_platform_connections
        (id, provider, name, line_account_id, external_account_ref, credentials_enc, metadata_json, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      id,
      input.provider,
      input.name,
      input.lineAccountId ?? null,
      input.externalAccountRef ?? null,
      input.credentialsEnc ?? null,
      input.metadataJson ?? '{}',
      now,
      now,
    )
    .run();
  return (await getAdPlatformConnectionById(db, id))!;
}

export type UpdateAdPlatformConnectionInput = Partial<{
  name: string;
  externalAccountRef: string | null;
  credentialsEnc: string | null;
  metadataJson: string;
  isActive: boolean;
}>;

export async function updateAdPlatformConnection(
  db: D1Database,
  id: string,
  input: UpdateAdPlatformConnectionInput,
): Promise<AdPlatformConnectionRow | null> {
  const existing = await getAdPlatformConnectionById(db, id);
  if (!existing) return null;
  const now = jstNow();
  await db
    .prepare(
      `UPDATE ad_platform_connections SET
         name = ?,
         external_account_ref = ?,
         credentials_enc = ?,
         metadata_json = ?,
         is_active = ?,
         updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      input.name ?? existing.name,
      'externalAccountRef' in input
        ? (input.externalAccountRef ?? null)
        : existing.external_account_ref,
      'credentialsEnc' in input ? (input.credentialsEnc ?? null) : existing.credentials_enc,
      input.metadataJson ?? existing.metadata_json,
      input.isActive !== undefined ? (input.isActive ? 1 : 0) : existing.is_active,
      now,
      id,
    )
    .run();
  return getAdPlatformConnectionById(db, id);
}

export async function deleteAdPlatformConnection(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM ad_platform_connections WHERE id = ?`).bind(id).run();
}
