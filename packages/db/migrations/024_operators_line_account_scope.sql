-- Add per-LINE-account scoping for operators.
-- Moves UNIQUE(email) to UNIQUE(email, line_account_id).

-- 1) Add column (NULL = legacy/global, visible only to unrestricted admins).
ALTER TABLE operators ADD COLUMN line_account_id TEXT REFERENCES line_accounts (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_operators_line_account_id ON operators (line_account_id);

-- 2) Replace UNIQUE(email) constraint with (email, line_account_id).
-- SQLite cannot drop constraints directly; create a unique index for the new shape.
-- Note: if an old UNIQUE(email) index exists, it should be removed manually during ops if needed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_operators_email_line_account ON operators (email, line_account_id);

