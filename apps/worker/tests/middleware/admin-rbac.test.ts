import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { adminRbacMiddleware } from '../../src/middleware/admin-rbac.js';
import type { Env } from '../../src/index.js';

function cfAccessEnv(overrides: Partial<Env['Bindings']> = {}): Env['Bindings'] {
  return {
    DB: {} as D1Database,
    API_KEY: 'k',
    REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
    ...overrides,
  } as Env['Bindings'];
}

function dbReturningRole(role: 'viewer' | 'admin' | null): D1Database {
  return {
    prepare(sql: string) {
      const api = {
        bind() {
          return api;
        },
        first: async () => {
          if (sql.includes('COUNT(*)')) {
            return { c: 99 };
          }
          return role === null ? null : { role };
        },
      };
      return api;
    },
  } as unknown as D1Database;
}

/** Strict allowlist + at least one principal row + no row for this email → unlisted. */
function dbStrictUnlistedMock(): D1Database {
  return {
    prepare(sql: string) {
      const api = {
        bind() {
          return api;
        },
        first: async () => {
          if (sql.includes('COUNT(*)')) {
            return { c: 1 };
          }
          return null;
        },
      };
      return api;
    },
  } as unknown as D1Database;
}

/** Strict allowlist + empty `admin_principal_roles` → bootstrap (only principal-roles API). */
function dbEmptyPrincipalTableMock(): D1Database {
  return {
    prepare(sql: string) {
      const api = {
        bind() {
          return api;
        },
        first: async () => {
          if (sql.includes('COUNT(*)')) {
            return { c: 0 };
          }
          return null;
        },
      };
      return api;
    },
  } as unknown as D1Database;
}

describe('adminRbacMiddleware', () => {
  it('skips RBAC for auth-exempt paths', async () => {
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'v@example.com' });
      await next();
    });
    app.use('*', adminRbacMiddleware);
    app.post('/webhook', (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request('http://localhost/webhook', { method: 'POST' }), {
      ...cfAccessEnv({ DB: dbReturningRole('viewer') }),
    } as never);

    expect(res.status).toBe(200);
  });

  it('does nothing when Cloudflare Access is not enforced', async () => {
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'v@example.com' });
      await next();
    });
    app.use('*', adminRbacMiddleware);
    app.post('/api/tags', (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request('http://localhost/api/tags', { method: 'POST' }), {
      DB: dbReturningRole('viewer'),
      API_KEY: 'k',
    } as never);

    expect(res.status).toBe(200);
  });

  it('returns 403 when Access is enforced but email claim is missing', async () => {
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { sub: 'no-email' });
      await next();
    });
    app.use('*', adminRbacMiddleware);
    app.get('/api/tags', (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request('http://localhost/api/tags'), {
      ...cfAccessEnv({ DB: dbReturningRole(null) }),
    } as never);

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/email/i);
  });

  it('allows viewer GET', async () => {
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'v@example.com' });
      await next();
    });
    app.use('*', adminRbacMiddleware);
    app.get('/api/tags', (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request('http://localhost/api/tags'), {
      ...cfAccessEnv({ DB: dbReturningRole('viewer') }),
    } as never);

    expect(res.status).toBe(200);
  });

  it('blocks viewer POST except auth login/logout', async () => {
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'v@example.com' });
      await next();
    });
    app.use('*', adminRbacMiddleware);
    app.post('/api/tags', (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request('http://localhost/api/tags', { method: 'POST' }), {
      ...cfAccessEnv({ DB: dbReturningRole('viewer') }),
    } as never);

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/read-only/i);
  });

  it('allows viewer POST /api/auth/login', async () => {
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'v@example.com' });
      await next();
    });
    app.use('*', adminRbacMiddleware);
    app.post('/api/auth/login', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://localhost/api/auth/login', { method: 'POST' }),
      { ...cfAccessEnv({ DB: dbReturningRole('viewer') }) } as never,
    );

    expect(res.status).toBe(200);
  });

  it('allows mutating requests when DB role is admin', async () => {
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'a@example.com' });
      await next();
    });
    app.use('*', adminRbacMiddleware);
    app.post('/api/tags', (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request('http://localhost/api/tags', { method: 'POST' }), {
      ...cfAccessEnv({ DB: dbReturningRole('admin') }),
    } as never);

    expect(res.status).toBe(200);
  });

  it('allows mutating requests when no role row (default admin) if strict allowlist is off', async () => {
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'new@example.com' });
      await next();
    });
    app.use('*', adminRbacMiddleware);
    app.post('/api/tags', (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request('http://localhost/api/tags', { method: 'POST' }), {
      ...cfAccessEnv({ DB: dbReturningRole(null), REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST: undefined }),
    } as never);

    expect(res.status).toBe(200);
  });

  it('denies API when strict allowlist is on and email has no D1 row', async () => {
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'stranger@example.com' });
      await next();
    });
    app.use('*', adminRbacMiddleware);
    app.post('/api/tags', (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request('http://localhost/api/tags', { method: 'POST' }), {
      ...cfAccessEnv({
        DB: dbStrictUnlistedMock(),
        REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST: '1',
      }),
    } as never);

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/not listed|admin_principal_roles/i);
  });

  it('allows principal-roles routes when strict allowlist is on but table is empty (bootstrap)', async () => {
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'bootstrap@example.com' });
      await next();
    });
    app.use('*', adminRbacMiddleware);
    app.put('/api/admin/principal-roles', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://localhost/api/admin/principal-roles', { method: 'PUT' }),
      {
        ...cfAccessEnv({
          DB: dbEmptyPrincipalTableMock(),
          REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST: '1',
        }),
      } as never,
    );

    expect(res.status).toBe(200);
  });
});
