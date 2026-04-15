import { Hono } from 'hono';
import { verifySignature, LineClient } from '@line-crm/line-sdk';
import type { WebhookRequestBody } from '@line-crm/line-sdk';
import type { Env } from '../index.js';
import { BodyTooLargeError, readTextBodyWithLimit } from '../services/request-body.js';
import { handleLineWebhookEvent } from '../application/line-webhook-handlers.js';
import { enforceRateLimit } from '../services/request-rate-limit.js';
import { prioritizeLineWebhookEvents } from '../services/line-webhook-event-order.js';
import { resolveLineWebhookCredentials } from '../services/line-webhook-multi-account.js';

const webhook = new Hono<Env>();
const LINE_WEBHOOK_LIMIT_BYTES = 256 * 1024;
const LINE_WEBHOOK_MAX_EVENTS = 50;
const LINE_WEBHOOK_RATE_LIMIT = { limit: 300, windowMs: 60_000 };

webhook.post('/webhook', async (c) => {
  const limited = await enforceRateLimit(c, {
    bucket: 'line-webhook',
    db: c.env.DB,
    limit: LINE_WEBHOOK_RATE_LIMIT.limit,
    windowMs: LINE_WEBHOOK_RATE_LIMIT.windowMs,
  });
  if (limited) {
    return limited;
  }

  let rawBody: string;
  try {
    rawBody = await readTextBodyWithLimit(c.req.raw, LINE_WEBHOOK_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof Error && err.name === 'BodyTooLargeError') {
      return c.json({ status: 'payload_too_large' }, 413);
    }
    console.error('Failed to read webhook body', err);
    return c.json({ status: 'ok' }, 200);
  }

  const signature = c.req.header('X-Line-Signature') ?? '';
  const db = c.env.DB;

  let body: WebhookRequestBody;
  try {
    body = JSON.parse(rawBody) as WebhookRequestBody;
  } catch {
    console.error('Failed to parse webhook body');
    return c.json({ status: 'ok' }, 200);
  }

  // Multi-account: resolve credentials from DB by destination (channel user ID)
  // or fall back to environment variables (default account)
  const creds = await resolveLineWebhookCredentials({
    db,
    env: c.env,
    destination: (body as { destination?: string }).destination,
    rawBody,
    signature,
  });
  const channelSecret = creds.channelSecret;
  const channelAccessToken = creds.channelAccessToken;
  const matchedAccountId = creds.matchedAccountId;

  // Verify with resolved secret
  const valid = await verifySignature(channelSecret, rawBody, signature);
  if (!valid) {
    console.error('Invalid LINE signature');
    return c.json({ status: 'ok' }, 200);
  }

  const lineClient = new LineClient(channelAccessToken);

  if (!Array.isArray(body.events)) {
    console.warn('LINE webhook: body.events is not an array');
    return c.json({ status: 'ok' }, 200);
  }

  const events =
    body.events.length > LINE_WEBHOOK_MAX_EVENTS
      ? body.events.slice(0, LINE_WEBHOOK_MAX_EVENTS)
      : body.events;
  if (body.events.length > LINE_WEBHOOK_MAX_EVENTS) {
    console.warn(
      `LINE webhook truncated: ${body.events.length} events, processing first ${LINE_WEBHOOK_MAX_EVENTS}`,
    );
  }

  // 非同期処理 — LINE は ~1s 以内のレスポンスを要求
  const processingPromise = (async () => {
    for (const event of prioritizeLineWebhookEvents(events)) {
      try {
        await handleLineWebhookEvent(
          db,
          lineClient,
          event,
          channelAccessToken,
          matchedAccountId,
          c.env.WORKER_URL || new URL(c.req.url).origin,
          c.env,
        );
      } catch (err) {
        console.error('Error handling webhook event:', err);
      }
    }
  })();

  try {
    c.executionCtx.waitUntil(processingPromise);
  } catch {
    void processingPromise;
  }

  return c.json({ status: 'ok' }, 200);
});

export { webhook };
