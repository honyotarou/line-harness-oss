import { Hono } from 'hono';
import { listAdminStripeEvents, processStripeWebhook } from '../application/stripe-events.js';
import type { Env } from '../index.js';
import { clampListLimit } from '../services/query-limits.js';
import { resolveLineAccountScopeForRequest } from '../services/admin-line-account-scope.js';
import {
  jsonBodyReadErrorResponse,
  readTextBodyWithLimit,
  STRIPE_WEBHOOK_RAW_BODY_LIMIT_BYTES,
} from '../services/request-body.js';
import { enforceRateLimit } from '../services/request-rate-limit.js';

const stripe = new Hono<Env>();
const STRIPE_WEBHOOK_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

function jsonStripeFailure(
  c: { json: (body: unknown, status?: 400 | 401 | 503) => Response },
  failure: Readonly<{ body: unknown; status: number }>,
) {
  return c.json(failure.body, failure.status as 400 | 401 | 503);
}

// ========== Stripeイベント一覧 ==========

stripe.get('/api/integrations/stripe/events', async (c) => {
  try {
    const friendId = c.req.query('friendId') ?? undefined;
    const eventType = c.req.query('eventType') ?? undefined;
    const limit = clampListLimit(c.req.query('limit'), 100, 500);
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await listAdminStripeEvents(c.env.DB, scope, { friendId, eventType, limit });
    return c.json({ success: true, data: out.data });
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
    const out = await processStripeWebhook(
      c.env.DB,
      c.env,
      rawBody,
      c.req.header('Stripe-Signature') ?? '',
    );
    if (!out.ok) {
      return jsonStripeFailure(c, out);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('POST /api/integrations/stripe/webhook error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { stripe };
