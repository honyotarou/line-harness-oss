/**
 * Cycle 3 — Attacker view: admin (or stolen session) clears incoming webhook secret → unauthenticated receive path.
 */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getIncomingWebhookById: vi.fn(),
  updateIncomingWebhook: vi.fn(),
  createIncomingWebhook: vi.fn(),
  getIncomingWebhooks: vi.fn(),
  deleteIncomingWebhook: vi.fn(),
  getOutgoingWebhooks: vi.fn(),
  getOutgoingWebhookById: vi.fn(),
  createOutgoingWebhook: vi.fn(),
  updateOutgoingWebhook: vi.fn(),
  deleteOutgoingWebhook: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

describe('Cycle 3: PUT incoming webhook cannot clear secret', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((fn) => fn.mockReset());
  });

  it('returns 400 when secret is set to empty string', async () => {
    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    const res = await app.fetch(
      new Request('http://localhost/api/webhooks/incoming/hook-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: '' }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(400);
    expect(dbMocks.updateIncomingWebhook).not.toHaveBeenCalled();
  });

  it('returns 400 when secret is only whitespace', async () => {
    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    const res = await app.fetch(
      new Request('http://localhost/api/webhooks/incoming/hook-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: '   ' }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(400);
    expect(dbMocks.updateIncomingWebhook).not.toHaveBeenCalled();
  });
});
