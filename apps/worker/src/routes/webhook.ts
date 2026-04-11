import { Hono } from 'hono';
import { verifySignature, LineClient } from '@line-crm/line-sdk';
import type { WebhookRequestBody } from '@line-crm/line-sdk';
import { getLineAccounts } from '@line-crm/db';
import type { Env } from '../index.js';
import { BodyTooLargeError, readTextBodyWithLimit } from '../services/request-body.js';
import { handleLineWebhookEvent } from '../application/line-webhook-handlers.js';
import { enforceRateLimit } from '../services/request-rate-limit.js';

const webhook = new Hono<Env>();
const LINE_WEBHOOK_LIMIT_BYTES = 256 * 1024;
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
    if (err instanceof BodyTooLargeError) {
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
  let channelSecret = c.env.LINE_CHANNEL_SECRET;
  let channelAccessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
  let matchedAccountId: string | null = null;

  if ((body as { destination?: string }).destination) {
    const accounts = await getLineAccounts(db);
    for (const account of accounts) {
      if (!account.is_active) continue;
      const isValid = await verifySignature(account.channel_secret, rawBody, signature);
      if (isValid) {
        channelSecret = account.channel_secret;
        channelAccessToken = account.channel_access_token;
        matchedAccountId = account.id;
        break;
      }
    }
  }

  // Verify with resolved secret
  const valid = await verifySignature(channelSecret, rawBody, signature);
  if (!valid) {
    console.error('Invalid LINE signature');
    return c.json({ status: 'ok' }, 200);
  }

  const lineClient = new LineClient(channelAccessToken);

  // 非同期処理 — LINE は ~1s 以内のレスポンスを要求
  const processingPromise = (async () => {
    for (const event of body.events) {
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
