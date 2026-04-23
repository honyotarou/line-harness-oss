-- Tags: per–LINE-account scope (replaces global UNIQUE(name)).
-- Tracked links: optional line_account_id for multi-tenant isolation.

PRAGMA foreign_keys=OFF;

-- ---------------------------------------------------------------------------
-- Tags rebuild (remove UNIQUE(name); add line_account_id + scoped uniqueness)
-- ---------------------------------------------------------------------------
CREATE TABLE tags__031 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  line_account_id TEXT REFERENCES line_accounts (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

INSERT INTO tags__031 (id, name, color, line_account_id, created_at)
SELECT id, name, color, NULL, created_at FROM tags;

DROP TABLE tags;
ALTER TABLE tags__031 RENAME TO tags;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_scope_name ON tags (COALESCE(line_account_id, ''), name);
CREATE INDEX IF NOT EXISTS idx_tags_line_account_id ON tags (line_account_id);

PRAGMA foreign_keys=ON;

-- ---------------------------------------------------------------------------
-- Tracked links: LINE account scope (nullable for legacy single-tenant rows)
-- ---------------------------------------------------------------------------
ALTER TABLE tracked_links ADD COLUMN line_account_id TEXT REFERENCES line_accounts (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tracked_links_line_account_id ON tracked_links (line_account_id);
