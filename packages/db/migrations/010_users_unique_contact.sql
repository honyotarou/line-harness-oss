-- Enforce at most one user per non-null email / phone / external_id (SQLite partial unique indexes).

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (email) WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users (phone) WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_id_unique ON users (external_id) WHERE external_id IS NOT NULL;
