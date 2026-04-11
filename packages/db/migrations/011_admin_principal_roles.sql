-- Admin RBAC: Cloudflare Access email → role (viewer = read-only API). Idempotent with schema.sql.

CREATE TABLE IF NOT EXISTS admin_principal_roles (
  email      TEXT PRIMARY KEY COLLATE NOCASE,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_admin_principal_roles_role ON admin_principal_roles (role);
