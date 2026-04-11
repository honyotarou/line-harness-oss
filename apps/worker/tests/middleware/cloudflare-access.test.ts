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
