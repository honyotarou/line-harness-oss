import { jstNow } from './utils.js';
// Stripe決済連携クエリヘルパー

export type StripeEventRow = Readonly<{
  id: string;
  stripe_event_id: string;
  event_type: string;
  friend_id: string | null;
  amount: number | null;
  currency: string | null;
  metadata: string | null;
  processed_at: string;
}>;

export async function getStripeEvents(
  db: D1Database,
  opts: {
    friendId?: string;
    eventType?: string;
    limit?: number;
    /**
     * When set (including empty array), restrict to events whose `friend_id` resolves to a friend in one of these LINE accounts.
     * Empty array returns no rows. Omit for unrestricted listing (single-account / legacy API key mode).
     */
    allowedLineAccountIds?: string[];
  } = {},
): Promise<StripeEventRow[]> {
  const limit = opts.limit ?? 100;
  const restricted = opts.allowedLineAccountIds !== undefined;
  if (restricted && opts.allowedLineAccountIds!.length === 0) {
    return [];
  }

  const parts: string[] = [];
  const bindings: unknown[] = [];

  if (restricted) {
    const ids = opts.allowedLineAccountIds!;
    const ph = ids.map(() => '?').join(',');
    parts.push(`f.line_account_id IN (${ph})`);
    bindings.push(...ids);
  }
  if (opts.friendId) {
    parts.push(restricted ? `se.friend_id = ?` : `friend_id = ?`);
    bindings.push(opts.friendId);
  }
  if (opts.eventType) {
    parts.push(restricted ? `se.event_type = ?` : `event_type = ?`);
    bindings.push(opts.eventType);
  }

  const where = parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
  bindings.push(limit);

  const from = restricted
    ? `stripe_events se INNER JOIN friends f ON f.id = se.friend_id`
    : `stripe_events`;
  const select = restricted ? `SELECT se.*` : `SELECT *`;
  const order = restricted ? `ORDER BY se.processed_at DESC` : `ORDER BY processed_at DESC`;

  const result = await db
    .prepare(`${select} FROM ${from} ${where} ${order} LIMIT ?`)
    .bind(...bindings)
    .all<StripeEventRow>();
  return result.results;
}

export async function getStripeEventByStripeId(
  db: D1Database,
  stripeEventId: string,
): Promise<StripeEventRow | null> {
  return db
    .prepare(`SELECT * FROM stripe_events WHERE stripe_event_id = ?`)
    .bind(stripeEventId)
    .first<StripeEventRow>();
}

export async function createStripeEvent(
  db: D1Database,
  input: {
    stripeEventId: string;
    eventType: string;
    friendId?: string;
    amount?: number;
    currency?: string;
    metadata?: string;
  },
): Promise<StripeEventRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO stripe_events (id, stripe_event_id, event_type, friend_id, amount, currency, metadata, processed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.stripeEventId,
      input.eventType,
      input.friendId ?? null,
      input.amount ?? null,
      input.currency ?? null,
      input.metadata ?? null,
      now,
    )
    .run();
  return (await db
    .prepare(`SELECT * FROM stripe_events WHERE id = ?`)
    .bind(id)
    .first<StripeEventRow>())!;
}
