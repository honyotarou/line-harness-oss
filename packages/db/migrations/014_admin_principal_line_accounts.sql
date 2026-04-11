-- Optional: restrict Cloudflare Access principals to specific LINE accounts (IDOR mitigation).
-- No rows for an email → that principal may access all accounts (legacy behavior).
-- One or more rows → that principal may only use those line_account_id values in admin APIs.

CREATE TABLE IF NOT EXISTS admin_principal_line_accounts (
  email            TEXT NOT NULL COLLATE NOCASE,
  line_account_id  TEXT NOT NULL,
  PRIMARY KEY (email, line_account_id),
  FOREIGN KEY (line_account_id) REFERENCES line_accounts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_principal_line_accounts_account
  ON admin_principal_line_accounts (line_account_id);
