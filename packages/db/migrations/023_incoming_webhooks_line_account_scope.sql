-- Add per-LINE-account scoping for incoming webhook configuration.
-- Existing rows remain NULL-scoped (visible only to unrestricted admins).

ALTER TABLE incoming_webhooks ADD COLUMN line_account_id TEXT REFERENCES line_accounts (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_incoming_webhooks_line_account_id ON incoming_webhooks (line_account_id);

