import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('stripe routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
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
      { DB: {} as D1Database } as never,
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

  it('records new stripe webhook events in development mode', async () => {
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

    const response = await app.fetch(
      new Request('http://localhost/api/integrations/stripe/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      }),
      { DB: {} as D1Database } as never,
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
});
