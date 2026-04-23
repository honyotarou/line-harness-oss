const INSERT_SQL = `INSERT INTO liff_oauth_state_jtis (jti, expires_at_ms) VALUES (?, ?)`;
const CONSUME_SQL = `DELETE FROM liff_oauth_state_jtis WHERE jti = ? AND expires_at_ms > ?`;

export async function insertLiffOAuthStateJti(
  db: D1Database,
  jti: string,
  expiresAtMs: number,
): Promise<void> {
  await db.prepare(INSERT_SQL).bind(jti, expiresAtMs).run();
}

/** Deletes the row if present and not expired; returns true when exactly one row was removed. */
export async function consumeLiffOAuthStateJti(
  db: D1Database,
  jti: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const res = await db.prepare(CONSUME_SQL).bind(jti, nowMs).run();
  return (res.meta?.changes ?? 0) === 1;
}
