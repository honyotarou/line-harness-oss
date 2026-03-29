-- Migration 009: operability hardening
-- Adds persistent rate limiting, LINE profile cache, and delivery reliability tables.

ALTER TABLE notification_rules ADD COLUMN line_account_id TEXT;
ALTER TABLE notifications ADD COLUMN line_account_id TEXT;

CREATE INDEX IF NOT EXISTS idx_notification_rules_line_account_id ON notification_rules (line_account_id);
CREATE INDEX IF NOT EXISTS idx_notifications_line_account_id ON notifications (line_account_id);

CREATE TABLE IF NOT EXISTS request_rate_limits (
  bucket            TEXT NOT NULL,
  subject_key       TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  count             INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (bucket, subject_key, window_started_at)
);

CREATE INDEX IF NOT EXISTS idx_request_rate_limits_updated_at ON request_rate_limits (updated_at);

CREATE TABLE IF NOT EXISTS line_account_profile_cache (
  line_account_id TEXT PRIMARY KEY REFERENCES line_accounts (id) ON DELETE CASCADE,
  display_name    TEXT,
  picture_url     TEXT,
  basic_id        TEXT,
  fetched_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS delivery_operations (
  id              TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  job_name        TEXT NOT NULL,
  line_account_id TEXT REFERENCES line_accounts (id) ON DELETE SET NULL,
  source_type     TEXT NOT NULL,
  source_id       TEXT NOT NULL,
  friend_id       TEXT REFERENCES friends (id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  next_retry_at   TEXT,
  last_error      TEXT,
  metadata        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_delivery_operations_job_status ON delivery_operations (job_name, status);
CREATE INDEX IF NOT EXISTS idx_delivery_operations_retry_at ON delivery_operations (next_retry_at);
CREATE INDEX IF NOT EXISTS idx_delivery_operations_line_account_id ON delivery_operations (line_account_id);

CREATE TABLE IF NOT EXISTS delivery_dead_letters (
  id              TEXT PRIMARY KEY,
  operation_id    TEXT REFERENCES delivery_operations (id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  job_name        TEXT NOT NULL,
  line_account_id TEXT REFERENCES line_accounts (id) ON DELETE SET NULL,
  source_type     TEXT NOT NULL,
  source_id       TEXT NOT NULL,
  friend_id       TEXT REFERENCES friends (id) ON DELETE SET NULL,
  error_message   TEXT NOT NULL,
  metadata        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_delivery_dead_letters_job_name ON delivery_dead_letters (job_name);
CREATE INDEX IF NOT EXISTS idx_delivery_dead_letters_line_account_id ON delivery_dead_letters (line_account_id);
CREATE INDEX IF NOT EXISTS idx_delivery_dead_letters_created_at ON delivery_dead_letters (created_at);
