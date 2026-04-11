import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRequestRateLimits } from '../../src/services/request-rate-limit.js';

const dbMocks = vi.hoisted(() => ({
  getStripeEvents: vi.fn(),
  getStripeEventByStripeId: vi.fn(),
  createStripeEvent: vi.fn(),
  jstNow: vi.fn(),
  applyScoring: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

vi.mock('../../src/services/event-bus.js', () => ({
  fireEvent: vi.fn(),
}));

async function stripeWebhookSignature(
  secret: string,
  rawBody: string,
  timestamp = String(Math.floor(Date.now() / 1000)),
): Promise<string> {
  const encoder = new TextEncoder();
  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const v1 = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `t=${timestamp},v1=${v1}`;
}

function makeEnv(overrides: Partial<{ DB: D1Database; STRIPE_WEBHOOK_SECRET: string }> = {}) {
  return {
    DB: {} as D1Database,
    STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
    ...overrides,
  } as never;
}

describe('stripe routes', () => {
  beforeEach(() => {
    resetRequestRateLimits();
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  afterEach(() => {
    resetRequestRateLimits();
  });

  it('lists stripe events with parsed metadata', async () => {
    dbMocks.getStripeEvents.mockResolvedValue([
      {
        id: 'event-1',
        stripe_event_id: 'evt_1',
        event_type: 'charge.succeeded',
        friend_id: 'friend-1',
        amount: 1200,
        currency: 'jpy',
        metadata: '{"orderId":"order-1"}',
        processed_at: '2026-03-26T10:00:00+09:00',
      },
    ]);

    const { stripe } = await import('../../src/routes/stripe.js');
    const app = new Hono();
    app.route('/', stripe);

    const response = await app.fetch(
      new Request('http://localhost/api/integrations/stripe/events'),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'event-1',
          stripeEventId: 'evt_1',
          eventType: 'charge.succeeded',
          friendId: 'friend-1',
          amount: 1200,
          currency: 'jpy',
          metadata: { orderId: 'order-1' },
          processedAt: '2026-03-26T10:00:00+09:00',
        },
      ],
    });
  });

  it('caps stripe events list limit query passed to the database layer', async () => {
    dbMocks.getStripeEvents.mockResolvedValue([]);

    const { stripe } = await import('../../src/routes/stripe.js');
    const app = new Hono();
    app.route('/', stripe);

    const response = await app.fetch(
      new Request('http://localhost/api/integrations/stripe/events?limit=99999'),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(dbMocks.getStripeEvents).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 500 }),
    );
    await response.json();
  });

  it('returns null metadata when stored stripe_events.metadata is corrupt JSON', async () => {
    dbMocks.getStripeEvents.mockResolvedValue([
      {
        id: 'event-bad',
        stripe_event_id: 'evt_bad',
        event_type: 'charge.succeeded',
        friend_id: null,
        amount: null,
        currency: null,
        metadata: '{not-json',
        processed_at: '2026-03-26T10:00:00+09:00',
      },
    ]);

    const { stripe } = await import('../../src/routes/stripe.js');
    const app = new Hono();
    app.route('/', stripe);

    const response = await app.fetch(
      new Request('http://localhost/api/integrations/stripe/events'),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'event-bad',
          stripeEventId: 'evt_bad',
          eventType: 'charge.succeeded',
          friendId: null,
          amount: null,
          currency: null,
          metadata: null,
          processedAt: '2026-03-26T10:00:00+09:00',
        },
      ],
    });
  });

  it('rejects webhook when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    const { stripe } = await import('../../src/routes/stripe.js');
    const app = new Hono();
    app.route('/', stripe);

    const response = await app.fetch(
      new Request('http://localhost/api/integrations/stripe/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'evt_1',
          type: 'charge.succeeded',
          data: { object: { id: 'ch_1' } },
        }),
      }),
      makeEnv({ STRIPE_WEBHOOK_SECRET: '' }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('STRIPE_WEBHOOK_SECRET'),
    });
    expect(dbMocks.createStripeEvent).not.toHaveBeenCalled();
  });

  it('rejects webhook when body exceeds size limit before signature verification', async () => {
    const { STRIPE_WEBHOOK_RAW_BODY_LIMIT_BYTES } = await import(
      '../../src/services/request-body.js'
    );
    const { stripe } = await import('../../src/routes/stripe.js');
    const app = new Hono();
    app.route('/', stripe);

    const response = await app.fetch(
      new Request('http://localhost/api/integrations/stripe/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(STRIPE_WEBHOOK_RAW_BODY_LIMIT_BYTES + 1),
        },
        body: '{}',
      }),
      makeEnv(),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/too large/i),
    });
    expect(dbMocks.createStripeEvent).not.toHaveBeenCalled();
  });

  it('rejects webhook when signature is invalid', async () => {
    const { stripe } = await import('../../src/routes/stripe.js');
    const app = new Hono();
    app.route('/', stripe);

    const rawBody = JSON.stringify({
      id: 'evt_1',
      type: 'charge.succeeded',
      data: { object: { id: 'ch_1', metadata: {} } },
    });

    const response = await app.fetch(
      new Request('http://localhost/api/integrations/stripe/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': 't=1,v1=deadbeef',
        },
        body: rawBody,
      }),
      makeEnv(),
    );

    expect(response.status).toBe(401);
    expect(dbMocks.createStripeEvent).not.toHaveBeenCalled();
  });

  it('returns 400 when webhook body is not valid JSON after signature verification', async () => {
    const { stripe } = await import('../../src/routes/stripe.js');
    const app = new Hono();
    app.route('/', stripe);

    const rawBody = '{not-json';
    const sig = await stripeWebhookSignature('whsec_test_secret', rawBody);

    const response = await app.fetch(
      new Request('http://localhost/api/integrations/stripe/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': sig,
        },
        body: rawBody,
      }),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(dbMocks.createStripeEvent).not.toHaveBeenCalled();
  });

  it('records stripe webhook events when signature is valid', async () => {
    dbMocks.getStripeEventByStripeId.mockResolvedValue(null);
    dbMocks.createStripeEvent.mockResolvedValue({
      id: 'db-event-1',
      stripe_event_id: 'evt_1',
      event_type: 'charge.succeeded',
      friend_id: null,
      amount: 1200,
      currency: 'jpy',
      metadata: '{"source":"test"}',
      processed_at: '2026-03-26T10:00:00+09:00',
    });

    const { stripe } = await import('../../src/routes/stripe.js');
    const app = new Hono();
    app.route('/', stripe);

    const rawBody = JSON.stringify({
      id: 'evt_1',
      type: 'charge.succeeded',
      data: {
        object: {
          id: 'ch_1',
          amount: 1200,
          currency: 'jpy',
          metadata: { source: 'test' },
        },
      },
    });
    const sig = await stripeWebhookSignature('whsec_test_secret', rawBody);

    const response = await app.fetch(
      new Request('http://localhost/api/integrations/stripe/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': sig,
        },
        body: rawBody,
      }),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(dbMocks.createStripeEvent).toHaveBeenCalledWith(expect.anything(), {
      stripeEventId: 'evt_1',
      eventType: 'charge.succeeded',
      friendId: undefined,
      amount: 1200,
      currency: 'jpy',
      metadata: '{"source":"test"}',
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'db-event-1',
        stripeEventId: 'evt_1',
        eventType: 'charge.succeeded',
        processedAt: '2026-03-26T10:00:00+09:00',
      },
    });
  });

  it('rate limits excessive Stripe webhook POSTs from a single client IP', async () => {
    const { stripe } = await import('../../src/routes/stripe.js');
    const app = new Hono();
    app.route('/', stripe);

    let last = 200;
    for (let i = 0; i < 122; i++) {
      const response = await app.fetch(
        new Request('http://localhost/api/integrations/stripe/webhook', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '203.0.113.51',
          },
          body: '{}',
        }),
        makeEnv(),
      );
      last = response.status;
    }
    expect(last).toBe(429);
  });
});
