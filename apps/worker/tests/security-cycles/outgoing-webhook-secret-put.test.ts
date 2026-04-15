/**
 * Outgoing webhook admin must not clear signing secret (unsigned delivery).
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

describe('Cycle: PUT outgoing webhook cannot clear secret', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((fn) => fn.mockReset());
  });

  it('returns 400 when secret is set to empty string', async () => {
    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.route('/', webhooks);

    dbMocks.getOutgoingWebhookById.mockResolvedValue({
      id: 'ow-1',
      name: 'H',
      url: 'https://example.com/h',
      event_types: '[]',
      secret: 'existing',
      line_account_id: null,
      is_active: 1,
      created_at: '2026-01-01T00:00:00+09:00',
      updated_at: '2026-01-01T00:00:00+09:00',
    });

    const res = await app.fetch(
      new Request('http://localhost/api/webhooks/outgoing/ow-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: '' }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(400);
    expect(dbMocks.updateOutgoingWebhook).not.toHaveBeenCalled();
  });
});
