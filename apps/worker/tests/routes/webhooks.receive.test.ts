import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getIncomingWebhooks: vi.fn(),
  getIncomingWebhookById: vi.fn(),
  createIncomingWebhook: vi.fn(),
  updateIncomingWebhook: vi.fn(),
  deleteIncomingWebhook: vi.fn(),
  getOutgoingWebhooks: vi.fn(),
  getOutgoingWebhookById: vi.fn(),
  createOutgoingWebhook: vi.fn(),
  updateOutgoingWebhook: vi.fn(),
  deleteOutgoingWebhook: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

const eventBusMocks = vi.hoisted(() => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/event-bus.js', () => eventBusMocks);

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('incoming webhook receive route', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    eventBusMocks.fireEvent.mockClear();
  });

  it('rejects unsigned requests when the webhook has a secret', async () => {
    dbMocks.getIncomingWebhookById.mockResolvedValue({
      id: 'incoming-1',
      source_type: 'custom',
      secret: 'top-secret',
      is_active: 1,
    });

    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    const body = JSON.stringify({ ok: true });
    const response = await app.fetch(
      new Request('http://localhost/api/webhooks/incoming/incoming-1/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(401);
    expect(eventBusMocks.fireEvent).not.toHaveBeenCalled();
  });

  it('accepts a valid signed request', async () => {
    dbMocks.getIncomingWebhookById.mockResolvedValue({
      id: 'incoming-1',
      source_type: 'custom',
      secret: 'top-secret',
      is_active: 1,
    });

    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    const body = JSON.stringify({ ok: true });
    const response = await app.fetch(
      new Request('http://localhost/api/webhooks/incoming/incoming-1/receive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': sign('top-secret', body),
        },
        body,
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(200);
    expect(eventBusMocks.fireEvent).toHaveBeenCalledOnce();
  });

  it('rejects oversized payloads before dispatching events', async () => {
    dbMocks.getIncomingWebhookById.mockResolvedValue({
      id: 'incoming-1',
      source_type: 'custom',
      secret: null,
      is_active: 1,
    });

    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    const body = JSON.stringify({ payload: 'x'.repeat(70_000) });
    const response = await app.fetch(
      new Request('http://localhost/api/webhooks/incoming/incoming-1/receive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(body.length),
        },
        body,
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(413);
    expect(eventBusMocks.fireEvent).not.toHaveBeenCalled();
  });

  it('rate limits repeated incoming webhook requests from the same client', async () => {
    dbMocks.getIncomingWebhookById.mockResolvedValue({
      id: 'incoming-1',
      source_type: 'custom',
      secret: null,
      is_active: 1,
    });

    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    let response: Response | undefined;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      response = await app.fetch(
        new Request('http://localhost/api/webhooks/incoming/incoming-1/receive', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '198.51.100.30',
          },
          body: JSON.stringify({ ok: true }),
        }),
        { DB: {} as D1Database } as never,
      );
    }

    expect(response?.status).toBe(429);
    expect(eventBusMocks.fireEvent).toHaveBeenCalledTimes(20);
  });
});
