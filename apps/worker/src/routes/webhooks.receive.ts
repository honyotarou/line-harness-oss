import { Hono } from 'hono';
import { getIncomingWebhookById } from '@line-crm/db';
import type { Env } from '../index.js';
import { tryConsumeIncomingWebhookPayload } from '../services/incoming-webhook-dedup.js';
import { verifySignedPayload } from '../services/signed-payload.js';
import { jsonBodyReadErrorResponse, readTextBodyWithLimit } from '../services/request-body.js';
import { enforceRateLimit } from '../services/request-rate-limit.js';
import { sanitizeIncomingWebhookPayload } from '../services/incoming-webhook-payload-sanitizer.js';

const INCOMING_WEBHOOK_LIMIT_BYTES = 64 * 1024;
const INCOMING_WEBHOOK_PER_ID_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

/** Shared by all `/api/webhooks/incoming/:id/receive` — caps total hits per client IP (mitigates ID scanning). */
export const INCOMING_WEBHOOK_GLOBAL_RATE_LIMIT = { limit: 100, windowMs: 60_000 };

/** Opaque 401 for missing/inactive webhooks and bad signatures (avoid ID enumeration). */
const INCOMING_WEBHOOK_UNAUTHORIZED = { success: false, error: 'Unauthorized' } as const;

const incomingWebhookReceive = new Hono<Env>();

incomingWebhookReceive.post('/api/webhooks/incoming/:id/receive', async (c) => {
  try {
    const limitedGlobal = await enforceRateLimit(c, {
      bucket: 'incoming-webhook:global',
      db: c.env.DB,
      limit: INCOMING_WEBHOOK_GLOBAL_RATE_LIMIT.limit,
      windowMs: INCOMING_WEBHOOK_GLOBAL_RATE_LIMIT.windowMs,
    });
    if (limitedGlobal) {
      return limitedGlobal;
    }

    const limited = await enforceRateLimit(c, {
      bucket: `incoming-webhook:${c.req.param('id')}`,
      db: c.env.DB,
      limit: INCOMING_WEBHOOK_PER_ID_RATE_LIMIT.limit,
      windowMs: INCOMING_WEBHOOK_PER_ID_RATE_LIMIT.windowMs,
    });
    if (limited) {
      return limited;
    }

    const id = c.req.param('id');
    const wh = await getIncomingWebhookById(c.env.DB, id);
    if (!wh || !wh.is_active) {
      return c.json(INCOMING_WEBHOOK_UNAUTHORIZED, 401);
    }

    if (!wh.secret?.trim()) {
      return c.json(INCOMING_WEBHOOK_UNAUTHORIZED, 401);
    }

    const rawBody = await readTextBodyWithLimit(c.req.raw, INCOMING_WEBHOOK_LIMIT_BYTES);
    const signature = c.req.header('X-Webhook-Signature') ?? '';
    const ts = c.req.header('X-Webhook-Timestamp') ?? undefined;
    const valid = await verifySignedPayload(wh.secret, rawBody, signature, {
      timestamp: ts,
      maxAgeSec: 300,
    });
    if (!valid) {
      return c.json(INCOMING_WEBHOOK_UNAUTHORIZED, 401);
    }

    let body: unknown;
    try {
      body = rawBody.trim() === '' ? {} : JSON.parse(rawBody);
    } catch {
      return c.json({ success: false, error: 'Invalid JSON body' }, 400);
    }
    if (body === null || typeof body !== 'object') {
      return c.json({ success: false, error: 'Webhook JSON body must be an object or array' }, 400);
    }

    const firstDelivery = await tryConsumeIncomingWebhookPayload(c.env.DB, id, rawBody);
    if (!firstDelivery) {
      return c.json({ success: true, data: { received: true, source: wh.source_type } });
    }

    const eventType = `incoming_webhook.${wh.source_type}`;
    const { fireEventRespectingAutomationWebhookHosts } = await import(
      '../services/fire-event-outbound.js'
    );
    const safePayload = sanitizeIncomingWebhookPayload(body);
    await fireEventRespectingAutomationWebhookHosts(
      c.env.DB,
      eventType,
      {
        eventData: { webhookId: wh.id, source: wh.source_type, payload: safePayload },
      },
      c.env,
      undefined,
      undefined,
      { incomingWebhookTriggered: true },
    );

    return c.json({ success: true, data: { received: true, source: wh.source_type } });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    if (err instanceof SyntaxError) {
      return c.json({ success: false, error: 'Invalid JSON body' }, 400);
    }
    console.error('POST /api/webhooks/incoming/:id/receive error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { incomingWebhookReceive };
