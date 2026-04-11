-- LINE webhook replay mitigation: first-seen webhookEventId wins (D1 INSERT OR IGNORE).

CREATE TABLE IF NOT EXISTS line_webhook_processed_events (
  webhook_event_id TEXT PRIMARY KEY,
  received_at_ms   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_line_webhook_processed_events_received_at_ms
  ON line_webhook_processed_events (received_at_ms);
