import { Hono } from 'hono';
import {
  getIncomingWebhooks,
  getIncomingWebhookById,
  createIncomingWebhook,
  updateIncomingWebhook,
  deleteIncomingWebhook,
  getOutgoingWebhooks,
  getOutgoingWebhookById,
  createOutgoingWebhook,
  updateOutgoingWebhook,
  deleteOutgoingWebhook,
} from '@line-crm/db';
import type { Env } from '../index.js';
import { assertHttpsOutboundUrlResolvedSafe } from '../services/outbound-url-resolve.js';
import { tryConsumeIncomingWebhookPayload } from '../services/incoming-webhook-dedup.js';
import { maskSigningSecretForList } from '../services/signing-secret-display.js';
import { verifySignedPayload } from '../services/signed-payload.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
  readTextBodyWithLimit,
} from '../services/request-body.js';
import { enforceRateLimit } from '../services/request-rate-limit.js';
import { parseStringArrayJson } from '../services/safe-json.js';

const webhooks = new Hono<Env>();
const INCOMING_WEBHOOK_LIMIT_BYTES = 64 * 1024;

function buildIncomingWebhookUpdates(body: Record<string, unknown>): Partial<{
  name: string;
  sourceType: string;
  secret: string;
  isActive: boolean;
}> {
  const updates: Partial<{
    name: string;
    sourceType: string;
    secret: string;
    isActive: boolean;
  }> = {};
  if (typeof body.name === 'string') updates.name = body.name;
  const st = body.sourceType ?? body.source_type;
  if (typeof st === 'string') updates.sourceType = st;
  if (body.secret !== undefined && body.secret !== null) {
    updates.secret = String(body.secret);
  }
  const ia = body.isActive ?? body.is_active;
  if (typeof ia === 'boolean') updates.isActive = ia;
  else if (ia === 0 || ia === 1) updates.isActive = Boolean(ia);
  return updates;
}
const INCOMING_WEBHOOK_PER_ID_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

/** Shared by all `/api/webhooks/incoming/:id/receive` — caps total hits per client IP (mitigates ID scanning). */
export const INCOMING_WEBHOOK_GLOBAL_RATE_LIMIT = { limit: 100, windowMs: 60_000 };

// ========== 受信Webhook ==========

webhooks.get('/api/webhooks/incoming', async (c) => {
  try {
    const items = await getIncomingWebhooks(c.env.DB);
    return c.json({
      success: true,
      data: items.map((w) => ({
        id: w.id,
        name: w.name,
        sourceType: w.source_type,
        secret: maskSigningSecretForList(w.secret),
        isActive: Boolean(w.is_active),
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/webhooks/incoming error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.post('/api/webhooks/incoming', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{
      name: string;
      sourceType?: string;
      secret?: string;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);
    if (!body.secret?.trim()) {
      return c.json(
        {
          success: false,
          error: 'secret is required (incoming webhooks must verify HMAC signatures)',
        },
        400,
      );
    }
    const item = await createIncomingWebhook(c.env.DB, body);
    return c.json(
      {
        success: true,
        data: {
          id: item.id,
          name: item.name,
          sourceType: item.source_type,
          isActive: Boolean(item.is_active),
          createdAt: item.created_at,
        },
      },
      201,
    );
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/webhooks/incoming error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.put('/api/webhooks/incoming/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    if (body.secret !== undefined && body.secret !== null) {
      if (String(body.secret).trim() === '') {
        return c.json(
          {
            success: false,
            error:
              'secret cannot be empty; set a non-empty signing secret or omit the field to leave it unchanged',
          },
          400,
        );
      }
    }
    await updateIncomingWebhook(c.env.DB, id, buildIncomingWebhookUpdates(body));
    const updated = await getIncomingWebhookById(c.env.DB, id);
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        sourceType: updated.source_type,
        isActive: Boolean(updated.is_active),
      },
    });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/webhooks/incoming/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.delete('/api/webhooks/incoming/:id', async (c) => {
  try {
    await deleteIncomingWebhook(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/webhooks/incoming/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 送信Webhook ==========

webhooks.get('/api/webhooks/outgoing', async (c) => {
  try {
    const items = await getOutgoingWebhooks(c.env.DB);
    return c.json({
      success: true,
      data: items.map((w) => ({
        id: w.id,
        name: w.name,
        url: w.url,
        eventTypes: parseStringArrayJson(w.event_types) ?? [],
        secret: maskSigningSecretForList(w.secret),
        isActive: Boolean(w.is_active),
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/webhooks/outgoing error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.post('/api/webhooks/outgoing', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{
      name: string;
      url: string;
      eventTypes: string[];
      secret?: string;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    if (!body.name || !body.url)
      return c.json({ success: false, error: 'name and url are required' }, 400);
    const outboundOk = await assertHttpsOutboundUrlResolvedSafe(body.url, fetch);
    if (!outboundOk.ok) {
      return c.json({ success: false, error: outboundOk.reason }, 400);
    }
    const item = await createOutgoingWebhook(c.env.DB, {
      ...body,
      eventTypes: body.eventTypes ?? [],
    });
    return c.json(
      {
        success: true,
        data: {
          id: item.id,
          name: item.name,
          url: item.url,
          eventTypes: parseStringArrayJson(item.event_types) ?? [],
          isActive: Boolean(item.is_active),
          createdAt: item.created_at,
        },
      },
      201,
    );
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/webhooks/outgoing error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.put('/api/webhooks/outgoing/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    if (body.url !== undefined && body.url !== null && String(body.url).trim() !== '') {
      const outboundOk = await assertHttpsOutboundUrlResolvedSafe(String(body.url), fetch);
      if (!outboundOk.ok) {
        return c.json({ success: false, error: outboundOk.reason }, 400);
      }
    }
    await updateOutgoingWebhook(c.env.DB, id, body);
    const updated = await getOutgoingWebhookById(c.env.DB, id);
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        url: updated.url,
        eventTypes: parseStringArrayJson(updated.event_types) ?? [],
        isActive: Boolean(updated.is_active),
      },
    });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/webhooks/outgoing/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.delete('/api/webhooks/outgoing/:id', async (c) => {
  try {
    await deleteOutgoingWebhook(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/webhooks/outgoing/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 受信Webhookエンドポイント (外部システムからの受信) ==========

webhooks.post('/api/webhooks/incoming/:id/receive', async (c) => {
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
    if (!wh || !wh.is_active)
      return c.json({ success: false, error: 'Webhook not found or inactive' }, 404);

    if (!wh.secret?.trim()) {
      return c.json(
        {
          success: false,
          error:
            'Incoming webhook has no signing secret; set a secret in the admin UI before accepting traffic',
        },
        503,
      );
    }

    const rawBody = await readTextBodyWithLimit(c.req.raw, INCOMING_WEBHOOK_LIMIT_BYTES);
    const signature = c.req.header('X-Webhook-Signature') ?? '';
    const valid = await verifySignedPayload(wh.secret, rawBody, signature);
    if (!valid) {
      return c.json({ success: false, error: 'Invalid webhook signature' }, 401);
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

    // イベントバスに発火: source_type をイベントタイプとして使用
    const { fireEvent } = await import('../services/event-bus.js');
    const eventType = `incoming_webhook.${wh.source_type}`;
    await fireEvent(c.env.DB, eventType, {
      eventData: { webhookId: wh.id, source: wh.source_type, payload: body },
    });

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

export { webhooks };
