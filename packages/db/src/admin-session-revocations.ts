import { jstNow } from './utils.js';

export async function isAdminSessionJtiRevoked(db: D1Database, jti: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS ok FROM admin_session_revocations WHERE jti = ? LIMIT 1`)
    .bind(jti)
    .first<{ ok: number }>();
  return Boolean(row);
}

export async function revokeAdminSessionJti(db: D1Database, jti: string): Promise<void> {
  await db
    .prepare(`INSERT OR IGNORE INTO admin_session_revocations (jti, revoked_at) VALUES (?, ?)`)
    .bind(jti, jstNow())
    .run();
}
