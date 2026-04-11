-- Server-side invalidation for admin HMAC session tokens (JWT id / jti).
CREATE TABLE IF NOT EXISTS admin_session_revocations (
  jti         TEXT PRIMARY KEY NOT NULL,
  revoked_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_session_revocations_revoked_at
  ON admin_session_revocations (revoked_at);
