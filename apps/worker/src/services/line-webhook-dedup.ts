/**
 * Mitigate LINE webhook replay: same `webhookEventId` (incl. LINE redelivery) is processed once.
 * When `webhookEventId` is absent, a stable synthetic key is derived (message id, replyToken, etc.).
 */

export const LINE_WEBHOOK_EVENT_DEDUP_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

type D1RunResult = { meta?: { changes?: number } };

function parseWebhookEventId(event: { webhookEventId?: unknown }): string | null {
  const raw = event.webhookEventId;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

/**
 * Stable storage key for `line_webhook_processed_events.webhook_event_id` (TEXT PRIMARY KEY).
 * Prefer LINE's `webhookEventId`; otherwise derive from message id / replyToken / timestamp.
 */
export function deriveLineWebhookDedupStorageKey(event: Record<string, unknown>): string | null {
  const wid = parseWebhookEventId(event);
  if (wid) {
    return wid;
  }

  const src = event.source as Record<string, unknown> | undefined;
  const userId = typeof src?.userId === 'string' ? src.userId : null;
  const type = typeof event.type === 'string' ? event.type : null;

  const message = event.message as Record<string, unknown> | undefined;
  if (type === 'message' && userId && message && typeof message.id === 'string' && message.id) {
    return `line:msg:${userId}:${message.id}`;
  }

  const replyToken = typeof event.replyToken === 'string' ? event.replyToken : null;
  if (replyToken) {
    return `line:rt:${replyToken}`;
  }

  const ts = typeof event.timestamp === 'number' ? event.timestamp : null;
  if (userId && type && ts !== null) {
    return `line:ts:${type}:${userId}:${ts}`;
  }

  return null;
}

async function pruneOldDedupRows(db: D1Database): Promise<void> {
  const cutoff = Date.now() - LINE_WEBHOOK_EVENT_DEDUP_RETENTION_MS;
  await db
    .prepare('DELETE FROM line_webhook_processed_events WHERE received_at_ms < ?')
    .bind(cutoff)
    .run();
}

/**
 * @returns `true` if the event should be handled, `false` if it was already processed (duplicate).
 */
export async function tryConsumeLineWebhookEvent(
  db: D1Database,
  event: Record<string, unknown>,
): Promise<boolean> {
  const key = deriveLineWebhookDedupStorageKey(event);
  if (!key) {
    return true;
  }

  const receivedAtMs = Date.now();
  const result = (await db
    .prepare(
      `INSERT OR IGNORE INTO line_webhook_processed_events (webhook_event_id, received_at_ms)
       VALUES (?, ?)`,
    )
    .bind(key, receivedAtMs)
    .run()) as D1RunResult;

  const changes = result.meta?.changes ?? 0;
  if (changes > 0) {
    void pruneOldDedupRows(db).catch(() => {
      /* best-effort retention */
    });
  }

  return changes > 0;
}
