-- Replay mitigation: identical raw body + webhook id is processed once (HMAC replay).

CREATE TABLE IF NOT EXISTS incoming_webhook_processed_payloads (
  webhook_id    TEXT NOT NULL,
  payload_hash  TEXT NOT NULL,
  received_at_ms INTEGER NOT NULL,
  PRIMARY KEY (webhook_id, payload_hash)
);

CREATE INDEX IF NOT EXISTS idx_incoming_webhook_payload_dedup_received_at_ms
  ON incoming_webhook_processed_payloads (received_at_ms);
