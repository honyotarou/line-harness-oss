-- Optional LINE account scope for outgoing webhooks (multi-tenant isolation + event routing).

ALTER TABLE outgoing_webhooks ADD COLUMN line_account_id TEXT;

CREATE INDEX IF NOT EXISTS idx_outgoing_webhooks_line_account_id ON outgoing_webhooks (line_account_id);
