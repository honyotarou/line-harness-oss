import { jstNow } from './utils.js';

export type MediaAssetRow = Readonly<{
  id: string;
  line_account_id: string | null;
  r2_key: string;
  mime_type: string;
  byte_size: number;
  public_token: string;
  created_at: string;
}>;

export type CreateMediaAssetInput = Readonly<{
  lineAccountId?: string | null;
  r2Key: string;
  mimeType: string;
  byteSize: number;
  publicToken: string;
}>;

export async function createMediaAsset(
  db: D1Database,
  input: CreateMediaAssetInput,
): Promise<MediaAssetRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO media_assets (id, line_account_id, r2_key, mime_type, byte_size, public_token, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.lineAccountId ?? null,
      input.r2Key,
      input.mimeType,
      input.byteSize,
      input.publicToken,
      now,
    )
    .run();
  return (await getMediaAssetById(db, id))!;
}

export async function getMediaAssetById(db: D1Database, id: string): Promise<MediaAssetRow | null> {
  return db.prepare(`SELECT * FROM media_assets WHERE id = ?`).bind(id).first<MediaAssetRow>();
}

export async function getMediaAssetByPublicToken(
  db: D1Database,
  publicToken: string,
): Promise<MediaAssetRow | null> {
  return db
    .prepare(`SELECT * FROM media_assets WHERE public_token = ?`)
    .bind(publicToken)
    .first<MediaAssetRow>();
}
