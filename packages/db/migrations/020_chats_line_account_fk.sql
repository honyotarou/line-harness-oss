-- Enforce chats.line_account_id → line_accounts(id) (nullable FK). Orphans → NULL.

UPDATE chats
SET line_account_id = NULL
WHERE line_account_id IS NOT NULL
  AND line_account_id NOT IN (SELECT id FROM line_accounts);

PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

CREATE TABLE chats_new (
  id              TEXT PRIMARY KEY,
  friend_id       TEXT NOT NULL REFERENCES friends (id) ON DELETE CASCADE,
  operator_id     TEXT REFERENCES operators (id) ON DELETE SET NULL,
  line_account_id TEXT REFERENCES line_accounts (id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'in_progress', 'resolved')),
  notes           TEXT,
  last_message_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

INSERT INTO chats_new (
  id,
  friend_id,
  operator_id,
  line_account_id,
  status,
  notes,
  last_message_at,
  created_at,
  updated_at
)
SELECT
  id,
  friend_id,
  operator_id,
  line_account_id,
  status,
  notes,
  last_message_at,
  created_at,
  updated_at
FROM chats;

DROP TABLE chats;

ALTER TABLE chats_new RENAME TO chats;

CREATE INDEX IF NOT EXISTS idx_chats_friend ON chats (friend_id);
CREATE INDEX IF NOT EXISTS idx_chats_operator ON chats (operator_id);
CREATE INDEX IF NOT EXISTS idx_chats_status ON chats (status);
CREATE INDEX IF NOT EXISTS idx_chats_line_account_id ON chats (line_account_id);

COMMIT;

PRAGMA foreign_keys=ON;
