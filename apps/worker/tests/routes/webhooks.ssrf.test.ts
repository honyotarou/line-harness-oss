import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../src/services/event-bus.js', () => ({ fireEvent: vi.fn() }));

function stubDnsWithPublicA() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('cloudflare-dns.com/dns-query')) {
        return new Response(
          JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }),
          { status: 200, headers: { 'Content-Type': 'application/dns-json' } },
        );
      }
      return new Response('', { status: 404 });
    }),
  );
}

describe('webhook URL and secret validation', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    stubDnsWithPublicA();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POST /api/webhooks/incoming rejects create without secret', async () => {
    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    const res = await app.fetch(
      new Request('http://localhost/api/webhooks/incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hook' }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(400);
    expect(dbMocks.createIncomingWebhook).not.toHaveBeenCalled();
  });

  it('POST /api/webhooks/outgoing rejects private URLs', async () => {
    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    const res = await app.fetch(
      new Request('http://localhost/api/webhooks/outgoing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bad',
          url: 'https://192.168.1.1/hook',
          eventTypes: [],
        }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(400);
    expect(dbMocks.createOutgoingWebhook).not.toHaveBeenCalled();
  });

  it('POST /api/webhooks/outgoing rejects hostname that DNS-resolves to a private address', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '10.0.0.50' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/dns-json' },
        }),
      ),
    );

    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    const res = await app.fetch(
      new Request('http://localhost/api/webhooks/outgoing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'DnsEvil',
          url: 'https://rebind.example/hook',
          eventTypes: [],
        }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/resolve|private|DNS|disallowed/i),
    });
    expect(dbMocks.createOutgoingWebhook).not.toHaveBeenCalled();
  });

  it('GET /api/webhooks/outgoing returns empty eventTypes when stored JSON is invalid', async () => {
    dbMocks.getOutgoingWebhooks.mockResolvedValue([
      {
        id: 'ow-1',
        name: 'Hook',
        url: 'https://example.com/hook',
        event_types: '{bad-json',
        secret: 'sec',
        line_account_id: null,
        is_active: 1,
        created_at: '2026-03-25T10:00:00+09:00',
        updated_at: '2026-03-25T10:00:00+09:00',
      },
    ]);

    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    const res = await app.fetch(new Request('http://localhost/api/webhooks/outgoing'), {
      DB: {} as D1Database,
    } as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'ow-1',
          name: 'Hook',
          url: 'https://example.com/hook',
          eventTypes: [],
          secret: '****',
          lineAccountId: null,
          isActive: true,
          createdAt: '2026-03-25T10:00:00+09:00',
          updatedAt: '2026-03-25T10:00:00+09:00',
        },
      ],
    });
  });
});
