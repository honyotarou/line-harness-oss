import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getTrafficPoolBySlug: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

describe('traffic pools', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /pool/:slug redirects to /auth/line with pool + forwarded query params (blocks account)', async () => {
    const { trafficPools } = await import('../../src/routes/traffic-pools.js');
    const app = new Hono();
    app.route('/', trafficPools);

    dbMocks.getTrafficPoolBySlug.mockResolvedValue({
      id: 'pool-1',
      slug: 'promo',
      name: 'Promo',
      active_account_id: 'acc-1',
      is_active: 1,
      created_at: 't',
      updated_at: 't',
      account_name: 'A',
      liff_id: '111-abc',
      login_channel_id: 'lc',
      login_channel_secret: 'ls',
      channel_access_token: 'tok',
      channel_id: 'chan',
    });

    const res = await app.fetch(
      new Request(
        'http://worker.example/pool/promo?ref=lp1&account=SHOULD_NOT_FORWARD&form=f1&utm_source=x',
      ),
      { DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(302);
    const loc = res.headers.get('Location');
    expect(loc).toBe('http://worker.example/auth/line?pool=promo&ref=lp1&form=f1&utm_source=x');
  });

  it('GET /pool/:slug returns 404 when missing', async () => {
    const { trafficPools } = await import('../../src/routes/traffic-pools.js');
    const app = new Hono();
    app.route('/', trafficPools);

    dbMocks.getTrafficPoolBySlug.mockResolvedValue(null);

    const res = await app.fetch(new Request('http://worker.example/pool/nope'), {
      DB: {} as D1Database,
    } as never);

    expect(res.status).toBe(404);
    const body = (await res.json()) as { success?: boolean; error?: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not found/i);
  });
});
