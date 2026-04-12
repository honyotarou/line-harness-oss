/**
 * Outgoing webhooks respect the same LINE account scope as other admin list APIs.
 */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getOutgoingWebhooks: vi.fn(),
  getOutgoingWebhookById: vi.fn(),
  createOutgoingWebhook: vi.fn(),
  updateOutgoingWebhook: vi.fn(),
  deleteOutgoingWebhook: vi.fn(),
  listPrincipalLineAccountIdsForEmail: vi.fn(),
  getLineAccounts: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

describe('outgoing webhooks LINE account scope', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(dbMocks).forEach((fn) => fn.mockReset());
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue(['scoped-acc']);
    dbMocks.getOutgoingWebhooks.mockResolvedValue([]);
  });

  it('returns 400 when Cloudflare-scoped principal omits lineAccountId on GET list', async () => {
    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', webhooks);

    const res = await app.fetch(new Request('http://localhost/api/webhooks/outgoing'), {
      DB: {} as D1Database,
      API_KEY: 'k',
      REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
    } as never);

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/lineAccountId query parameter is required/i);
  });

  it('returns 404 when Cloudflare-scoped principal PUTs a global outgoing webhook', async () => {
    dbMocks.getOutgoingWebhookById.mockResolvedValue({
      id: 'ow-1',
      name: 'Global',
      url: 'https://example.com/h',
      event_types: '[]',
      secret: null,
      line_account_id: null,
      is_active: 1,
      created_at: '2026-01-01T00:00:00+09:00',
      updated_at: '2026-01-01T00:00:00+09:00',
    });

    const { webhooks } = await import('../../src/routes/webhooks.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', webhooks);

    const res = await app.fetch(
      new Request('http://localhost/api/webhooks/outgoing/ow-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x' }),
      }),
      {
        DB: {} as D1Database,
        API_KEY: 'k',
        REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      } as never,
    );

    expect(res.status).toBe(404);
    expect(dbMocks.updateOutgoingWebhook).not.toHaveBeenCalled();
  });
});
