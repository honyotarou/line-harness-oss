-- Add per-LINE-account scoping for conversion tracking.
-- Existing rows remain NULL-scoped (visible only to unrestricted admins).

ALTER TABLE conversion_points ADD COLUMN line_account_id TEXT REFERENCES line_accounts (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversion_points_line_account_id ON conversion_points (line_account_id);

ALTER TABLE conversion_events ADD COLUMN line_account_id TEXT REFERENCES line_accounts (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversion_events_line_account_id ON conversion_events (line_account_id);

