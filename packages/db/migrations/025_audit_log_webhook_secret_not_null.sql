-- Admin audit trail (L5) + enforce non-empty webhook signing secrets (M2).
-- Existing rows with NULL/blank secret get a random placeholder (receive path still requires real secret rotation in admin UI).

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  action TEXT NOT NULL,
  actor_email TEXT,
  actor_kind TEXT NOT NULL DEFAULT 'unknown',
  resource_type TEXT,
  resource_id TEXT,
  metadata TEXT,
  request_path TEXT,
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log (created_at DESC);

BEGIN TRANSACTION;

CREATE TABLE incoming_webhooks__m025 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'custom',
  secret TEXT NOT NULL,
  line_account_id TEXT REFERENCES line_accounts (id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO incoming_webhooks__m025 (id, name, source_type, secret, line_account_id, is_active, created_at, updated_at)
SELECT
  id,
  name,
  source_type,
  CASE
    WHEN secret IS NULL OR trim(secret) = '' THEN lower(hex(randomblob(32)))
    ELSE secret
  END,
  line_account_id,
  is_active,
  created_at,
  updated_at
FROM incoming_webhooks;

DROP TABLE incoming_webhooks;
ALTER TABLE incoming_webhooks__m025 RENAME TO incoming_webhooks;

CREATE INDEX IF NOT EXISTS idx_incoming_webhooks_line_account_id ON incoming_webhooks (line_account_id);

CREATE TABLE outgoing_webhooks__m025 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  event_types TEXT NOT NULL DEFAULT '[]',
  secret TEXT NOT NULL,
  line_account_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO outgoing_webhooks__m025 (id, name, url, event_types, secret, line_account_id, is_active, created_at, updated_at)
SELECT
  id,
  name,
  url,
  event_types,
  CASE
    WHEN secret IS NULL OR trim(secret) = '' THEN lower(hex(randomblob(32)))
    ELSE secret
  END,
  line_account_id,
  is_active,
  created_at,
  updated_at
FROM outgoing_webhooks;

DROP TABLE outgoing_webhooks;
ALTER TABLE outgoing_webhooks__m025 RENAME TO outgoing_webhooks;

CREATE INDEX IF NOT EXISTS idx_outgoing_webhooks_line_account_id ON outgoing_webhooks (line_account_id);

COMMIT;
