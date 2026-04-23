-- One-time OAuth state binding (prevents signed-state replay across devices; complements HMAC on payload).
CREATE TABLE IF NOT EXISTS liff_oauth_state_jtis (
  jti            TEXT PRIMARY KEY,
  expires_at_ms  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_liff_oauth_state_jtis_expires_at_ms
  ON liff_oauth_state_jtis (expires_at_ms);
