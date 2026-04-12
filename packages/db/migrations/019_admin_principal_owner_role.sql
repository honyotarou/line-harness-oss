-- Add `owner` role: only principals listed as `owner` may write LINE Messaging API credentials
-- when Worker sets REQUIRE_OWNER_DB_ROLE_FOR_LINE_CREDENTIALS=1 (with Cloudflare Access).
-- No row for an email remains legacy full admin (including credentials).

PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

CREATE TABLE admin_principal_roles_new (
  email      TEXT PRIMARY KEY COLLATE NOCASE,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

INSERT INTO admin_principal_roles_new (email, role, updated_at)
SELECT email, role, updated_at FROM admin_principal_roles;

DROP TABLE admin_principal_roles;

ALTER TABLE admin_principal_roles_new RENAME TO admin_principal_roles;

CREATE INDEX IF NOT EXISTS idx_admin_principal_roles_role ON admin_principal_roles (role);

COMMIT;

PRAGMA foreign_keys=ON;
