import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getTrafficPoolBySlug: vi.fn(),
  getTrafficPools: vi.fn(),
  getTrafficPoolById: vi.fn(),
  createTrafficPool: vi.fn(),
  updateTrafficPool: vi.fn(),
  deleteTrafficPool: vi.fn(),
  getPoolAccounts: vi.fn(),
  addPoolAccount: vi.fn(),
  removePoolAccount: vi.fn(),
  togglePoolAccount: vi.fn(),
  listPrincipalLineAccountIdsForEmail: vi.fn(),
}));

vi.mock('@line-crm/db', async (importOriginal) => {
  const o = await importOriginal<typeof import('@line-crm/db')>();
  return { ...o, ...dbMocks };
});

const poolRow = (id: string, activeAccountId: string) =>
  ({
    id,
    slug: id,
    name: `pool-${id}`,
    active_account_id: activeAccountId,
    is_active: 1,
    created_at: 't',
    updated_at: 't',
    account_name: 'acc',
    liff_id: 'l',
    login_channel_id: 'lc',
    login_channel_secret: 'ls',
    channel_access_token: 'tok',
    channel_id: 'ch',
  }) as const;

const scopedEnv = {
  DB: {} as D1Database,
  API_KEY: 'k',
  REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
} as const;

function scopedApp(
  mod: typeof import('../../src/routes/traffic-pools.js'),
  email = 'scoped@example.com',
) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('cfAccessJwtPayload', { email });
    await next();
  });
  app.route('/', mod.trafficPools);
  return app;
}

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

describe('traffic pools — admin scope guard (F2)', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((fn) => fn.mockReset());
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue(['acc-A']);
  });

  it('GET /api/traffic-pools filters out cross-tenant pools', async () => {
    dbMocks.getTrafficPools.mockResolvedValue([
      poolRow('pool-A', 'acc-A'),
      poolRow('pool-B', 'acc-B'),
    ]);

    const mod = await import('../../src/routes/traffic-pools.js');
    const res = await scopedApp(mod).fetch(
      new Request('http://localhost/api/traffic-pools'),
      scopedEnv as never,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string }> };
    expect(body.data.map((d) => d.id)).toEqual(['pool-A']);
  });

  it('POST /api/traffic-pools returns 403 when activeAccountId is outside the scope', async () => {
    const mod = await import('../../src/routes/traffic-pools.js');
    const res = await scopedApp(mod).fetch(
      new Request('http://localhost/api/traffic-pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'hijack', name: 'hijack', activeAccountId: 'acc-B' }),
      }),
      scopedEnv as never,
    );

    expect(res.status).toBe(403);
    expect(dbMocks.createTrafficPool).not.toHaveBeenCalled();
  });

  it('PUT /api/traffic-pools/:id returns 404 when the pool belongs to another tenant', async () => {
    dbMocks.getTrafficPoolById.mockResolvedValue(poolRow('pool-B', 'acc-B'));

    const mod = await import('../../src/routes/traffic-pools.js');
    const res = await scopedApp(mod).fetch(
      new Request('http://localhost/api/traffic-pools/pool-B', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'rename' }),
      }),
      scopedEnv as never,
    );

    expect(res.status).toBe(404);
    expect(dbMocks.updateTrafficPool).not.toHaveBeenCalled();
  });

  it('PUT /api/traffic-pools/:id returns 403 when new activeAccountId is outside scope', async () => {
    dbMocks.getTrafficPoolById.mockResolvedValue(poolRow('pool-A', 'acc-A'));

    const mod = await import('../../src/routes/traffic-pools.js');
    const res = await scopedApp(mod).fetch(
      new Request('http://localhost/api/traffic-pools/pool-A', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeAccountId: 'acc-B' }),
      }),
      scopedEnv as never,
    );

    expect(res.status).toBe(403);
    expect(dbMocks.updateTrafficPool).not.toHaveBeenCalled();
  });

  it('DELETE /api/traffic-pools/:id returns 404 when the pool belongs to another tenant', async () => {
    dbMocks.getTrafficPoolById.mockResolvedValue(poolRow('pool-B', 'acc-B'));

    const mod = await import('../../src/routes/traffic-pools.js');
    const res = await scopedApp(mod).fetch(
      new Request('http://localhost/api/traffic-pools/pool-B', { method: 'DELETE' }),
      scopedEnv as never,
    );

    expect(res.status).toBe(404);
    expect(dbMocks.deleteTrafficPool).not.toHaveBeenCalled();
  });

  it('POST /api/traffic-pools/:id/accounts returns 404 for cross-tenant pool', async () => {
    dbMocks.getTrafficPoolById.mockResolvedValue(poolRow('pool-B', 'acc-B'));

    const mod = await import('../../src/routes/traffic-pools.js');
    const res = await scopedApp(mod).fetch(
      new Request('http://localhost/api/traffic-pools/pool-B/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineAccountId: 'acc-A' }),
      }),
      scopedEnv as never,
    );

    expect(res.status).toBe(404);
    expect(dbMocks.addPoolAccount).not.toHaveBeenCalled();
  });

  it('POST /api/traffic-pools/:id/accounts returns 403 when body.lineAccountId outside scope', async () => {
    dbMocks.getTrafficPoolById.mockResolvedValue(poolRow('pool-A', 'acc-A'));

    const mod = await import('../../src/routes/traffic-pools.js');
    const res = await scopedApp(mod).fetch(
      new Request('http://localhost/api/traffic-pools/pool-A/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineAccountId: 'acc-B' }),
      }),
      scopedEnv as never,
    );

    expect(res.status).toBe(403);
    expect(dbMocks.addPoolAccount).not.toHaveBeenCalled();
  });
});
