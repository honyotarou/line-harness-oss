import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../src/index.js';
import {
  createAdminBffInboundPathRewrite,
  resolveAdminBffInboundRewritePathname,
} from '../../src/middleware/admin-bff-inbound-path-rewrite.js';
import { authMiddleware } from '../../src/middleware/auth.js';

function createTestApp() {
  const app = new Hono<Env>();
  app.use('*', createAdminBffInboundPathRewrite(app));
  app.use('*', authMiddleware);
  app.get('/api/auth/session', (c) => c.json({ hit: 'session' }));
  app.get('/api/auth/access-bootstrap', (c) => {
    const loc = c.req.query('returnTo')?.trim() || '/login';
    return c.redirect(loc, 302);
  });
  app.get('/api/scenarios', (c) => c.json({ hit: 'scenarios' }));
  return app;
}

describe('resolveAdminBffInboundRewritePathname', () => {
  it('strips default BFF prefix for eligible /api paths', () => {
    expect(
      resolveAdminBffInboundRewritePathname('/api/lh-upstream/api/auth/session', undefined),
    ).toBe('/api/auth/session');
    expect(
      resolveAdminBffInboundRewritePathname(
        '/api/lh-upstream/api/auth/access-bootstrap',
        undefined,
      ),
    ).toBe('/api/auth/access-bootstrap');
  });

  it('returns null when prefix binding is empty (disabled)', () => {
    expect(
      resolveAdminBffInboundRewritePathname('/api/lh-upstream/api/auth/session', ''),
    ).toBeNull();
    expect(
      resolveAdminBffInboundRewritePathname('/api/lh-upstream/api/auth/session', '   '),
    ).toBeNull();
  });

  it('does not rewrite paths without the prefix', () => {
    expect(resolveAdminBffInboundRewritePathname('/api/auth/session', undefined)).toBeNull();
  });

  it('does not rewrite when the remainder is not an eligible admin proxy target', () => {
    expect(
      resolveAdminBffInboundRewritePathname('/api/lh-upstream/openapi.json', undefined),
    ).toBeNull();
  });

  it('supports a custom prefix from env', () => {
    expect(resolveAdminBffInboundRewritePathname('/mybff/api/health', '/mybff')).toBe(
      '/api/health',
    );
  });

  it('normalizes .. in the pathname before stripping', () => {
    expect(
      resolveAdminBffInboundRewritePathname('/api/lh-upstream/../api/auth/session', undefined),
    ).toBeNull();
  });
});

describe('createAdminBffInboundPathRewrite', () => {
  it('re-dispatches BFF-prefixed access-bootstrap like the canonical route', async () => {
    const app = createTestApp();
    const env = { API_KEY: 'secret' } as never;

    const direct = await app.fetch(
      new Request('http://localhost/api/auth/access-bootstrap?returnTo=%2Ffriends'),
      env,
    );
    const viaBff = await app.fetch(
      new Request('http://localhost/api/lh-upstream/api/auth/access-bootstrap?returnTo=%2Ffriends'),
      env,
    );

    expect(direct.status).toBe(302);
    expect(viaBff.status).toBe(302);
    expect(direct.headers.get('Location')).toBe('/friends');
    expect(viaBff.headers.get('Location')).toBe('/friends');
  });

  it('re-dispatches BFF-prefixed auth/session like the canonical route', async () => {
    const app = createTestApp();
    const env = { API_KEY: 'secret' } as never;

    const direct = await app.fetch(new Request('http://localhost/api/auth/session'), env);
    const viaBff = await app.fetch(
      new Request('http://localhost/api/lh-upstream/api/auth/session'),
      env,
    );

    expect(direct.status).toBe(200);
    expect(viaBff.status).toBe(200);
    expect(await direct.json()).toEqual({ hit: 'session' });
    expect(await viaBff.json()).toEqual({ hit: 'session' });
  });

  it('does not rewrite when ADMIN_INBOUND_BFF_PATH_PREFIX is empty', async () => {
    const app = createTestApp();
    const env = { API_KEY: 'secret', ADMIN_INBOUND_BFF_PATH_PREFIX: '' } as never;

    const res = await app.fetch(
      new Request('http://localhost/api/lh-upstream/api/auth/session'),
      env,
    );
    expect(res.status).toBe(401);
  });

  it('does not return 401 for BFF-prefixed access-bootstrap when inbound rewrite binding is empty', async () => {
    const app = createTestApp();
    const env = { API_KEY: 'secret', ADMIN_INBOUND_BFF_PATH_PREFIX: '' } as never;

    const res = await app.fetch(
      new Request('http://localhost/api/lh-upstream/api/auth/access-bootstrap?returnTo=%2Flogin'),
      env,
    );
    expect(res.status).not.toBe(401);
  });

  it('applies auth to protected routes after rewrite', async () => {
    const app = createTestApp();
    const env = { API_KEY: 'secret' } as never;

    const res = await app.fetch(new Request('http://localhost/api/lh-upstream/api/scenarios'), env);
    expect(res.status).toBe(401);
  });
});
