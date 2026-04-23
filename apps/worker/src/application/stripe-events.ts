import {
  createStripeEvent,
  findTagForFriendByName,
  getFriendById,
  getStripeEvents,
  getStripeEventByStripeId,
  jstNow,
} from '@line-crm/db';
import type { StripeEventRow } from '@line-crm/db';
import type { Env } from '../index.js';
import type { LineAccountScope } from '../services/admin-line-account-scope.js';
import { tryParseJsonRecord } from '../services/safe-json.js';
import { verifyStripeSignature } from '../services/stripe-signature.js';

type WorkerBindings = Env['Bindings'];

export type StripeWebhookBody = Readonly<{
  id: string;
  type: string;
  data: Readonly<{
    object: Readonly<{
      id: string;
      amount?: number;
      currency?: string;
      metadata?: Record<string, string>;
      customer?: string;
      status?: string;
    }>;
  }>;
}>;

export type SerializedStripeEvent = Readonly<{
  id: string;
  stripeEventId: string;
  eventType: string;
  friendId: string | null;
  amount: number | null;
  currency: string | null;
  metadata: Readonly<Record<string, unknown>> | null;
  processedAt: string;
}>;

type StripeFailure = Readonly<{ ok: false; status: 400 | 401 | 503; body: unknown }>;

function serializeStripeEvent(row: StripeEventRow): SerializedStripeEvent {
  return {
    id: row.id,
    stripeEventId: row.stripe_event_id,
    eventType: row.event_type,
    friendId: row.friend_id,
    amount: row.amount,
    currency: row.currency,
    metadata: tryParseJsonRecord(row.metadata),
    processedAt: row.processed_at,
  };
}

export async function listAdminStripeEvents(
  db: D1Database,
  scope: LineAccountScope,
  query: Readonly<{
    friendId?: string;
    eventType?: string;
    limit: number;
  }>,
): Promise<Readonly<{ ok: true; data: readonly SerializedStripeEvent[] }>> {
  const allowedLineAccountIds = scope.mode === 'restricted' ? [...scope.ids] : undefined;
  const items = await getStripeEvents(db, {
    friendId: query.friendId,
    eventType: query.eventType,
    limit: query.limit,
    allowedLineAccountIds,
  });
  return { ok: true, data: items.map(serializeStripeEvent) };
}

function parseStripeWebhookBody(rawBody: string): StripeWebhookBody | null {
  try {
    return JSON.parse(rawBody) as StripeWebhookBody;
  } catch {
    return null;
  }
}

async function applyPurchaseSideEffects(
  db: D1Database,
  env: WorkerBindings,
  body: StripeWebhookBody,
  friendId: string,
): Promise<void> {
  const friend = await getFriendById(db, friendId);
  const { applyScoring } = await import('@line-crm/db');
  await applyScoring(db, friendId, 'purchase');

  const productId = body.data.object.metadata?.product_id;
  if (productId) {
    const purchasedTag = await findTagForFriendByName(db, friendId, `purchased_${productId}`);
    if (purchasedTag) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at) VALUES (?, ?, ?)`,
        )
        .bind(friendId, purchasedTag.id, jstNow())
        .run();
    }
  }

  const { fireEventRespectingAutomationWebhookHosts } = await import(
    '../services/fire-event-outbound.js'
  );
  await fireEventRespectingAutomationWebhookHosts(
    db,
    'cv_fire',
    {
      friendId,
      eventData: {
        type: 'purchase',
        amount: body.data.object.amount,
        stripeEventId: body.id,
      },
    },
    env,
    undefined,
    friend?.line_account_id ?? null,
  );
}

async function applySubscriptionDeletedSideEffects(
  db: D1Database,
  friendId: string,
): Promise<void> {
  const cancelledTag = await findTagForFriendByName(db, friendId, 'subscription_cancelled');
  if (!cancelledTag) {
    return;
  }
  await db
    .prepare(`INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at) VALUES (?, ?, ?)`)
    .bind(friendId, cancelledTag.id, jstNow())
    .run();
}

export async function processStripeWebhook(
  db: D1Database,
  env: WorkerBindings,
  rawBody: string,
  signature: string,
): Promise<Readonly<{ ok: true; data: Readonly<Record<string, unknown>> }> | StripeFailure> {
  const stripeSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripeSecret) {
    return {
      ok: false,
      status: 503,
      body: { success: false, error: 'Stripe webhook is not configured' },
    };
  }

  const valid = await verifyStripeSignature(stripeSecret, rawBody, signature);
  if (!valid) {
    return {
      ok: false,
      status: 401,
      body: { success: false, error: 'Stripe signature verification failed' },
    };
  }

  const body = parseStripeWebhookBody(rawBody);
  if (!body) {
    return { ok: false, status: 400, body: { success: false, error: 'Invalid JSON body' } };
  }

  const existing = await getStripeEventByStripeId(db, body.id);
  if (existing) {
    return { ok: true, data: { message: 'Already processed' } };
  }

  const object = body.data.object;
  const friendId = object.metadata?.line_friend_id ?? null;
  const created = await createStripeEvent(db, {
    stripeEventId: body.id,
    eventType: body.type,
    friendId: friendId ?? undefined,
    amount: object.amount,
    currency: object.currency,
    metadata: JSON.stringify(object.metadata ?? {}),
  });

  if (!created.inserted) {
    return { ok: true, data: { message: 'Already processed' } };
  }

  if (body.type === 'payment_intent.succeeded' && friendId) {
    await applyPurchaseSideEffects(db, env, body, friendId);
  }

  if (body.type === 'customer.subscription.deleted' && friendId) {
    await applySubscriptionDeletedSideEffects(db, friendId);
  }

  return {
    ok: true,
    data: {
      id: created.row.id,
      stripeEventId: created.row.stripe_event_id,
      eventType: created.row.event_type,
      processedAt: created.row.processed_at,
    },
  };
}
