/**
 * List endpoints must not return full signing secrets (defense in depth vs XSS / log leaks).
 */
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

describe('GET webhook lists mask signing secrets', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(dbMocks).forEach((fn) => fn.mockReset());
  });

  it('GET /api/webhooks/incoming returns masked secret', async () => {
    dbMocks.getIncomingWebhooks.mockResolvedValue([
      {
        id: 'in-1',
        name: 'Test',
        source_type: 'stripe',
        secret: 'full-hmac-secret-value',
        is_active: 1,
        created_at: '2026-01-01T00:00:00+09:00',
        updated_at: '2026-01-01T00:00:00+09:00',
      },
    ]);

    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    const res = await app.fetch(new Request('http://localhost/api/webhooks/incoming'), {
      DB: {} as D1Database,
    } as never);

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: Array<{ secret: string | null }>;
    };
    expect(json.success).toBe(true);
    expect(json.data[0].secret).toBe('****alue');
  });

  it('GET /api/webhooks/outgoing returns masked secret', async () => {
    dbMocks.getOutgoingWebhooks.mockResolvedValue([
      {
        id: 'out-1',
        name: 'Ext',
        url: 'https://example.com/hook',
        event_types: '[]',
        secret: 'outgoing-signing-key-xyz9',
        is_active: 1,
        created_at: '2026-01-01T00:00:00+09:00',
        updated_at: '2026-01-01T00:00:00+09:00',
      },
    ]);

    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    const res = await app.fetch(new Request('http://localhost/api/webhooks/outgoing'), {
      DB: {} as D1Database,
    } as never);

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: Array<{ secret: string | null }>;
    };
    expect(json.success).toBe(true);
    expect(json.data[0].secret).toBe('****xyz9');
  });
});
