import { Hono } from 'hono';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cloudflareAccessMiddleware } from '../../src/middleware/cloudflare-access.js';
import type { Env } from '../../src/index.js';

function env(partial: Partial<Env['Bindings']> = {}): Env['Bindings'] {
  return {
    DB: {} as D1Database,
    LINE_CHANNEL_SECRET: 'x',
    LINE_CHANNEL_ACCESS_TOKEN: 'x',
    API_KEY: 'secret',
    LIFF_URL: 'https://liff.line.me/x',
    LINE_CHANNEL_ID: 'x',
    LINE_LOGIN_CHANNEL_ID: 'x',
    LINE_LOGIN_CHANNEL_SECRET: 'x',
    WORKER_URL: 'https://example.workers.dev',
    ...partial,
  } as Env['Bindings'];
}

describe('cloudflareAccessMiddleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does nothing when enforcement is disabled', async () => {
    const app = new Hono<{ Bindings: Env['Bindings'] }>();
    app.use('*', cloudflareAccessMiddleware);
    app.get('/private', (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request('http://localhost/private'), env());
    expect(res.status).toBe(200);
  });

  it('allows auth-exempt paths without Cf-Access-Jwt-Assertion', async () => {
    const app = new Hono<{ Bindings: Env['Bindings'] }>();
    app.use('*', cloudflareAccessMiddleware);
    app.post('/webhook', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://localhost/webhook', { method: 'POST' }),
      env({
        REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      }),
    );
    expect(res.status).toBe(200);
  });

  it('returns 403 when enforcement is on and JWT header is missing', async () => {
    const app = new Hono<{ Bindings: Env['Bindings'] }>();
    app.use('*', cloudflareAccessMiddleware);
    app.get('/private', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://localhost/private'),
      env({
        REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/access/i);
  });

  it('accepts CF_Authorization cookie as the application token when header is missing', async () => {
    const cfJwt = await import('../../src/services/cloudflare-access-jwt.js');
    vi.spyOn(cfJwt, 'verifyCloudflareAccessJwt').mockResolvedValue({
      ok: true,
      payload: { email: 'user@example.com' },
    });

    const app = new Hono<{ Bindings: Env['Bindings'] }>();
    app.use('*', cloudflareAccessMiddleware);
    app.get('/private', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://localhost/private', {
        headers: { Cookie: 'CF_Authorization=fake.jwt.here; other=1' },
      }),
      env({
        REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      }),
    );
    expect(res.status).toBe(200);
  });

  it('allows OPTIONS without JWT so CORS preflight can complete', async () => {
    const app = new Hono<{ Bindings: Env['Bindings'] }>();
    app.use('*', cloudflareAccessMiddleware);
    app.options('/api/auth/login', (c) => c.body(null, 204));

    const res = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'OPTIONS',
        headers: { Origin: 'https://admin.example.com' },
      }),
      env({
        REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      }),
    );
    expect(res.status).toBe(204);
  });

  it('allows OPTIONS without JWT even on paths that are not Access-exempt for non-OPTIONS', async () => {
    const app = new Hono<{ Bindings: Env['Bindings'] }>();
    app.use('*', cloudflareAccessMiddleware);
    app.options('/api/auth/session', (c) => c.body(null, 204));

    const res = await app.fetch(
      new Request('http://localhost/api/auth/session', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://admin.example.com',
          'Access-Control-Request-Method': 'GET',
        },
      }),
      env({
        REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      }),
    );
    expect(res.status).toBe(204);
  });

  it('returns 403 for POST /api/auth/login when enforcement is on and JWT is missing', async () => {
    const app = new Hono<{ Bindings: Env['Bindings'] }>();
    app.use('*', cloudflareAccessMiddleware);
    app.post('/api/auth/login', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'x' }),
      }),
      env({
        REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 for GET / when enforcement is on and JWT is missing', async () => {
    const app = new Hono<{ Bindings: Env['Bindings'] }>();
    app.use('*', cloudflareAccessMiddleware);
    app.get('/', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://localhost/'),
      env({
        REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 when JWT verifies but email claim is missing (RBAC / audit)', async () => {
    const cfJwt = await import('../../src/services/cloudflare-access-jwt.js');
    vi.spyOn(cfJwt, 'verifyCloudflareAccessJwt').mockResolvedValue({
      ok: true,
      payload: { sub: 'service-account' },
    });

    const app = new Hono<{ Bindings: Env['Bindings'] }>();
    app.use('*', cloudflareAccessMiddleware);
    app.get('/private', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://localhost/private', {
        headers: { 'Cf-Access-Jwt-Assertion': 'fake.jwt.here' },
      }),
      env({
        REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/email/i);
  });

  it('allows verified service-token JWT without email when common_name is allowlisted', async () => {
    const cfJwt = await import('../../src/services/cloudflare-access-jwt.js');
    vi.spyOn(cfJwt, 'verifyCloudflareAccessJwt').mockResolvedValue({
      ok: true,
      payload: {
        type: 'app',
        common_name: 'svcclient.access',
        iss: 'https://team.cloudflareaccess.com',
      },
    });

    const app = new Hono<Env>();
    app.use('*', cloudflareAccessMiddleware);
    app.get('/private', (c) => c.json({ ok: true, svc: c.get('cfAccessServiceAuth') === true }));

    const res = await app.fetch(
      new Request('http://localhost/private', {
        headers: { 'Cf-Access-Jwt-Assertion': 'fake.jwt.here' },
      }),
      env({
        REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
        CLOUDFLARE_ACCESS_TRUSTED_SERVICE_CLIENT_IDS: 'svcclient.access',
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; svc: boolean };
    expect(body.ok).toBe(true);
    expect(body.svc).toBe(true);
  });

  it('returns 403 when enforcement is on but jwt verification fails', async () => {
    const app = new Hono<{ Bindings: Env['Bindings'] }>();
    app.use('*', cloudflareAccessMiddleware);
    app.get('/private', (c) => c.json({ ok: true }));

    const fetchFn = vi.fn().mockResolvedValue(new Response('bad', { status: 500 }));
    vi.stubGlobal('fetch', fetchFn);

    const res = await app.fetch(
      new Request('http://localhost/private', {
        headers: { 'Cf-Access-Jwt-Assertion': 'a.b.c' },
      }),
      env({
        REQUIRE_CLOUDFLARE_ACCESS_JWT: 'true',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      }),
    );
    expect(res.status).toBe(403);
  });
});
