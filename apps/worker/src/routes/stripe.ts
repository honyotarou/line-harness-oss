import { Hono } from 'hono';
import { getStripeEvents, getStripeEventByStripeId, createStripeEvent, jstNow } from '@line-crm/db';
import type { Env } from '../index.js';
import { verifyStripeSignature } from '../services/stripe-signature.js';
import { tryParseJsonRecord } from '../services/safe-json.js';
import { clampListLimit } from '../services/query-limits.js';
import {
  jsonBodyReadErrorResponse,
  readTextBodyWithLimit,
  STRIPE_WEBHOOK_RAW_BODY_LIMIT_BYTES,
} from '../services/request-body.js';
import { enforceRateLimit } from '../services/request-rate-limit.js';

const stripe = new Hono<Env>();
const STRIPE_WEBHOOK_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

interface StripeWebhookBody {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      amount?: number;
      currency?: string;
      metadata?: Record<string, string>;
      customer?: string;
      status?: string;
    };
  };
}

// ========== Stripeイベント一覧 ==========

stripe.get('/api/integrations/stripe/events', async (c) => {
  try {
    const friendId = c.req.query('friendId') ?? undefined;
    const eventType = c.req.query('eventType') ?? undefined;
    const limit = clampListLimit(c.req.query('limit'), 100, 500);
    const items = await getStripeEvents(c.env.DB, { friendId, eventType, limit });
    return c.json({
      success: true,
      data: items.map((e) => ({
        id: e.id,
        stripeEventId: e.stripe_event_id,
        eventType: e.event_type,
        friendId: e.friend_id,
        amount: e.amount,
        currency: e.currency,
        metadata: tryParseJsonRecord(e.metadata),
        processedAt: e.processed_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/integrations/stripe/events error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Stripe Webhookレシーバー ==========

stripe.post('/api/integrations/stripe/webhook', async (c) => {
  try {
    const limited = await enforceRateLimit(c, {
      bucket: 'stripe-webhook',
      db: c.env.DB,
      limit: STRIPE_WEBHOOK_RATE_LIMIT.limit,
      windowMs: STRIPE_WEBHOOK_RATE_LIMIT.windowMs,
    });
    if (limited) {
      return limited;
    }

    const stripeSecret = c.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!stripeSecret) {
      return c.json(
        { success: false, error: 'Stripe webhook is not configured (set STRIPE_WEBHOOK_SECRET)' },
        503,
      );
    }

    let rawBody: string;
    try {
      rawBody = await readTextBodyWithLimit(c.req.raw, STRIPE_WEBHOOK_RAW_BODY_LIMIT_BYTES);
    } catch (err) {
      const jr = jsonBodyReadErrorResponse(err);
      if (jr) {
        return c.json(jr.body, jr.status);
      }
      throw err;
    }

    const sigHeader = c.req.header('Stripe-Signature') ?? '';
    const valid = await verifyStripeSignature(stripeSecret, rawBody, sigHeader);
    if (!valid) {
      return c.json({ success: false, error: 'Stripe signature verification failed' }, 401);
    }
    let body: StripeWebhookBody;
    try {
      body = JSON.parse(rawBody) as StripeWebhookBody;
    } catch {
      return c.json({ success: false, error: 'Invalid JSON body' }, 400);
    }

    // 冪等性チェック
    const existing = await getStripeEventByStripeId(c.env.DB, body.id);
    if (existing) {
      return c.json({ success: true, data: { message: 'Already processed' } });
    }

    const obj = body.data.object;
    const db = c.env.DB;

    // メタデータからfriendIdを取得（Stripeのメタデータにline_friend_idを設定している想定）
    const friendId = obj.metadata?.line_friend_id ?? null;

    // イベントを記録
    const event = await createStripeEvent(db, {
      stripeEventId: body.id,
      eventType: body.type,
      friendId: friendId ?? undefined,
      amount: obj.amount,
      currency: obj.currency,
      metadata: JSON.stringify(obj.metadata ?? {}),
    });

    // 決済成功時の自動処理
    if (body.type === 'payment_intent.succeeded' && friendId) {
      const { applyScoring } = await import('@line-crm/db');
      await applyScoring(db, friendId, 'purchase');

      // 自動タグ付け（product_idベース）
      const productId = obj.metadata?.product_id;
      if (productId) {
        const tag = await db
          .prepare(`SELECT id FROM tags WHERE name = ?`)
          .bind(`purchased_${productId}`)
          .first<{ id: string }>();
        if (tag) {
          await db
            .prepare(
              `INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at) VALUES (?, ?, ?)`,
            )
            .bind(friendId, tag.id, jstNow())
            .run();
        }
      }

      // イベントバスに発火（自動化ルール用）
      const { fireEvent } = await import('../services/event-bus.js');
      await fireEvent(db, 'cv_fire', {
        friendId,
        eventData: { type: 'purchase', amount: obj.amount, stripeEventId: body.id },
      });
    }

    // サブスクリプションイベント処理
    if (body.type === 'customer.subscription.deleted' && friendId) {
      const cancelledTag = await db
        .prepare(`SELECT id FROM tags WHERE name = 'subscription_cancelled'`)
        .first<{ id: string }>();
      if (cancelledTag) {
        await db
          .prepare(
            `INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at) VALUES (?, ?, ?)`,
          )
          .bind(friendId, cancelledTag.id, jstNow())
          .run();
      }
    }

    return c.json({
      success: true,
      data: {
        id: event.id,
        stripeEventId: event.stripe_event_id,
        eventType: event.event_type,
        processedAt: event.processed_at,
      },
    });
  } catch (err) {
    console.error('POST /api/integrations/stripe/webhook error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { stripe };
