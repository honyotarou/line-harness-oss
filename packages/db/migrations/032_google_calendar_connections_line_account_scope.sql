-- F3: Add per-LINE-account scoping for Google Calendar connections.
-- Existing rows remain NULL-scoped (visible only to unrestricted admins),
-- so upgrading does not silently expose legacy single-tenant data to
-- newly-restricted per-tenant admins.

ALTER TABLE google_calendar_connections ADD COLUMN line_account_id TEXT REFERENCES line_accounts (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_google_calendar_connections_line_account_id ON google_calendar_connections (line_account_id);
