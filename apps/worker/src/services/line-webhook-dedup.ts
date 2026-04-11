/**
 * Mitigate LINE webhook replay: same `webhookEventId` (incl. LINE redelivery) is processed once.
 * Payloads without `webhookEventId` are still processed (legacy / tests).
 */

export const LINE_WEBHOOK_EVENT_DEDUP_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

type D1RunResult = { meta?: { changes?: number } };

function parseWebhookEventId(event: { webhookEventId?: unknown }): string | null {
  const raw = event.webhookEventId;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
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
  event: { webhookEventId?: unknown },
): Promise<boolean> {
  const wid = parseWebhookEventId(event);
  if (!wid) {
    return true;
  }

  const receivedAtMs = Date.now();
  const result = (await db
    .prepare(
      `INSERT OR IGNORE INTO line_webhook_processed_events (webhook_event_id, received_at_ms)
       VALUES (?, ?)`,
    )
    .bind(wid, receivedAtMs)
    .run()) as D1RunResult;

  const changes = result.meta?.changes ?? 0;
  if (changes > 0) {
    void pruneOldDedupRows(db).catch(() => {
      /* best-effort retention */
    });
  }

  return changes > 0;
}
