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

/** In-memory D1: request_rate_limits + incoming_webhook_processed_payloads (matches production SQL shape). */
function createReceiveTestDb() {
  const rl = new Map<string, number>();
  const dedup = new Set<string>();

  const rlKey = (bucket: string, subject: string, window: number) =>
    `${bucket}\0${subject}\0${window}`;

  return {
    prepare(sql: string) {
      if (sql.includes('incoming_webhook_processed_payloads')) {
        if (sql.includes('INSERT OR IGNORE')) {
          return {
            bind: (webhookId: string, payloadHash: string, _ms: number) => ({
              run: async () => {
                const k = `${webhookId}\0${payloadHash}`;
                if (dedup.has(k)) return { meta: { changes: 0 } };
                dedup.add(k);
                return { meta: { changes: 1 } };
              },
            }),
          };
        }
        if (sql.includes('DELETE') && sql.includes('incoming_webhook_processed_payloads')) {
          return { bind: () => ({ run: async () => ({ meta: { changes: 0 } }) }) };
        }
      }
      if (sql.includes('request_rate_limits')) {
        if (sql.includes('INSERT INTO request_rate_limits') && sql.includes('ON CONFLICT')) {
          return {
            bind: (bucket: string, subject: string, windowStartedAt: number, _iso: string) => ({
              run: async () => {
                const key = rlKey(bucket, subject, windowStartedAt);
                rl.set(key, (rl.get(key) ?? 0) + 1);
                return { meta: { changes: 1 } };
              },
            }),
          };
        }
        if (sql.includes('SELECT count FROM request_rate_limits')) {
          return {
            bind: (bucket: string, subject: string, windowStartedAt: number) => ({
              first: async () => ({ count: rl.get(rlKey(bucket, subject, windowStartedAt)) ?? 0 }),
            }),
          };
        }
        if (sql.includes('DELETE FROM request_rate_limits')) {
          return { bind: () => ({ run: async () => ({}) }) };
        }
      }
      throw new Error(`Unhandled SQL in receive test db: ${sql.slice(0, 120)}`);
    },
  } as unknown as D1Database;
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
      { DB: createReceiveTestDb() } as never,
    );

    expect(response.status).toBe(200);
    expect(eventBusMocks.fireEvent).toHaveBeenCalledOnce();
  });

  it('accepts replayed identical payload with 200 but does not dispatch twice', async () => {
    dbMocks.getIncomingWebhookById.mockResolvedValue({
      id: 'incoming-1',
      source_type: 'custom',
      secret: 'top-secret',
      is_active: 1,
    });

    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    const db = createReceiveTestDb();
    const body = JSON.stringify({ ok: true });
    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': sign('top-secret', body),
    };

    const req = () =>
      new Request('http://localhost/api/webhooks/incoming/incoming-1/receive', {
        method: 'POST',
        headers,
        body,
      });

    const first = await app.fetch(req(), { DB: db } as never);
    const second = await app.fetch(req(), { DB: db } as never);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(eventBusMocks.fireEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects receive when the webhook has no signing secret configured', async () => {
    dbMocks.getIncomingWebhookById.mockResolvedValue({
      id: 'incoming-1',
      source_type: 'custom',
      secret: null,
      is_active: 1,
    });

    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    const response = await app.fetch(
      new Request('http://localhost/api/webhooks/incoming/incoming-1/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(503);
    expect(eventBusMocks.fireEvent).not.toHaveBeenCalled();
  });

  it('rejects JSON null or primitive bodies after signature verification', async () => {
    dbMocks.getIncomingWebhookById.mockResolvedValue({
      id: 'incoming-1',
      source_type: 'custom',
      secret: 'top-secret',
      is_active: 1,
    });

    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    for (const body of ['null', '42', '"x"']) {
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

      expect(response.status).toBe(400);
    }
    expect(eventBusMocks.fireEvent).not.toHaveBeenCalled();
  });

  it('rejects oversized payloads before dispatching events', async () => {
    dbMocks.getIncomingWebhookById.mockResolvedValue({
      id: 'incoming-1',
      source_type: 'custom',
      secret: 'top-secret',
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

  it('rate limits across many incoming webhook IDs (global per-IP budget)', async () => {
    dbMocks.getIncomingWebhookById.mockImplementation(async (_db: unknown, id: string) => ({
      id,
      source_type: 'custom',
      secret: 'top-secret',
      is_active: 1,
    }));

    const { webhooks, INCOMING_WEBHOOK_GLOBAL_RATE_LIMIT } = await import(
      '../../src/routes/webhooks.js'
    );
    const app = new Hono();
    app.route('/', webhooks);

    const db = createReceiveTestDb();
    const limit = INCOMING_WEBHOOK_GLOBAL_RATE_LIMIT.limit;
    for (let i = 0; i < limit + 1; i += 1) {
      const id = `incoming-${i}`;
      const body = JSON.stringify({ n: i });
      const response = await app.fetch(
        new Request(`http://localhost/api/webhooks/incoming/${id}/receive`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '203.0.113.99',
            'X-Webhook-Signature': sign('top-secret', body),
          },
          body,
        }),
        { DB: db } as never,
      );
      if (i < limit) {
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(429);
      }
    }

    expect(eventBusMocks.fireEvent).toHaveBeenCalledTimes(limit);
  });

  it('rate limits repeated incoming webhook requests from the same client', async () => {
    dbMocks.getIncomingWebhookById.mockResolvedValue({
      id: 'incoming-1',
      source_type: 'custom',
      secret: 'top-secret',
      is_active: 1,
    });

    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    const db = createReceiveTestDb();
    let response: Response | undefined;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      const body = JSON.stringify({ ok: true, attempt });
      response = await app.fetch(
        new Request('http://localhost/api/webhooks/incoming/incoming-1/receive', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '198.51.100.30',
            'X-Webhook-Signature': sign('top-secret', body),
          },
          body,
        }),
        { DB: db } as never,
      );
    }

    expect(response?.status).toBe(429);
    expect(eventBusMocks.fireEvent).toHaveBeenCalledTimes(20);
  });
});
