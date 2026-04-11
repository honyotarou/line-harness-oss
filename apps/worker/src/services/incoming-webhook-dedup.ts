/**
 * Mitigate HMAC replay: same raw body bytes for the same incoming webhook id are dispatched once.
 */

import { LINE_WEBHOOK_EVENT_DEDUP_RETENTION_MS } from './line-webhook-dedup.js';

type D1RunResult = { meta?: { changes?: number } };

async function sha256HexUtf8(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function pruneOldPayloadRows(db: D1Database): Promise<void> {
  const cutoff = Date.now() - LINE_WEBHOOK_EVENT_DEDUP_RETENTION_MS;
  await db
    .prepare('DELETE FROM incoming_webhook_processed_payloads WHERE received_at_ms < ?')
    .bind(cutoff)
    .run();
}

/**
 * @returns `true` if this delivery should run handlers; `false` if the same body was already accepted.
 */
export async function tryConsumeIncomingWebhookPayload(
  db: D1Database,
  webhookId: string,
  rawBody: string,
): Promise<boolean> {
  const payloadHash = await sha256HexUtf8(rawBody);
  const receivedAtMs = Date.now();
  const result = (await db
    .prepare(
      `INSERT OR IGNORE INTO incoming_webhook_processed_payloads (webhook_id, payload_hash, received_at_ms)
       VALUES (?, ?, ?)`,
    )
    .bind(webhookId, payloadHash, receivedAtMs)
    .run()) as D1RunResult;

  const changes = result.meta?.changes ?? 0;
  if (changes > 0) {
    void pruneOldPayloadRows(db).catch(() => {
      /* best-effort */
    });
  }

  return changes > 0;
}
