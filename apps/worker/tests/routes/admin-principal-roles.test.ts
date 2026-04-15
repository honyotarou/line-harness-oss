import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { authMiddleware } from '../../src/middleware/auth.js';
import { adminRbacMiddleware } from '../../src/middleware/admin-rbac.js';
import { adminPrincipalRolesRoutes } from '../../src/routes/admin-principal-roles.js';
import type { Env } from '../../src/index.js';

type Row = { email: string; role: string; updatedAt: string };

function cfAccessBindings(overrides: Partial<Env['Bindings']> = {}): Env['Bindings'] {
  return {
    DB: {} as D1Database,
    API_KEY: 'secret',
    REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
    ...overrides,
  } as Env['Bindings'];
}

function createStatefulDb(initial: Row[], viewerEmail: string | null) {
  const rows = [...initial];
  return {
    prepare(sql: string) {
      if (sql.includes('SELECT COUNT(*)') && sql.includes('admin_principal_roles')) {
        return {
          first: async () => ({ c: rows.length }),
        };
      }
      if (sql.includes('WHERE NOT EXISTS') && sql.includes('admin_principal_roles')) {
        return {
          bind(email: string, role: string) {
            return {
              run: async () => {
                if (rows.length > 0) {
                  return { success: true, meta: { changes: 0 } };
                }
                rows.push({ email, role, updatedAt: 't1' });
                return { success: true, meta: { changes: 1 } };
              },
            };
          },
        };
      }
      if (sql.includes('SELECT role FROM admin_principal_roles')) {
        return {
          bind(email: string) {
            return {
              first: async () => {
                if (viewerEmail && email === viewerEmail.toLowerCase()) {
                  return { role: 'viewer' };
                }
                const hit = rows.find((r) => r.email.toLowerCase() === email);
                return hit ? { role: hit.role } : null;
              },
            };
          },
        };
      }
      if (sql.includes('SELECT email, role, updated_at')) {
        return {
          all: async () => ({
            results: rows.map((r) => ({
              email: r.email,
              role: r.role,
              updatedAt: r.updatedAt,
            })),
          }),
        };
      }
      if (sql.includes('INSERT INTO admin_principal_roles') && sql.includes('ON CONFLICT')) {
        return {
          bind(email: string, role: string) {
            return {
              run: async () => {
                const i = rows.findIndex((r) => r.email.toLowerCase() === email.toLowerCase());
                const next = { email, role, updatedAt: 't1' };
                if (i >= 0) rows[i] = next;
                else rows.push(next);
                return { success: true, meta: { changes: 1 } };
              },
            };
          },
        };
      }
      if (sql.includes('DELETE FROM admin_principal_roles')) {
        return {
          bind(email: string) {
            return {
              run: async () => {
                const before = rows.length;
                const filtered = rows.filter((r) => r.email.toLowerCase() !== email.toLowerCase());
                rows.length = 0;
                rows.push(...filtered);
                return { success: true, meta: { changes: before - rows.length } };
              },
            };
          },
        };
      }
      if (sql.includes('admin_session_revocations')) {
        return {
          bind(_jti: string) {
            return {
              first: async () => null,
            };
          },
        };
      }
      if (sql.includes('INSERT INTO admin_audit_log')) {
        return {
          bind(..._args: unknown[]) {
            return {
              run: async () => ({ success: true, meta: { changes: 1 } }),
            };
          },
        };
      }
      throw new Error(`unexpected SQL in mock: ${sql.slice(0, 80)}`);
    },
  } as unknown as D1Database;
}

async function sessionHeaders(): Promise<Record<string, string>> {
  const { issueAdminSessionToken } = await import('../../src/services/admin-session.js');
  const now = Math.floor(Date.now() / 1000);
  const token = await issueAdminSessionToken('secret', { issuedAt: now, expiresInSeconds: 3600 });
  return {
    Authorization: `Bearer ${token}`,
    'X-Line-Harness-Client': '1',
  };
}

function createAccessApp(db: D1Database, bindings: Env['Bindings'], jwtEmail: string) {
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('cfAccessJwtPayload', { email: jwtEmail });
    await next();
  });
  app.use('*', authMiddleware);
  app.use('*', adminRbacMiddleware);
  app.route('/', adminPrincipalRolesRoutes);
  return { app, bindings: { ...bindings, DB: db } as Env['Bindings'] };
}

describe('admin principal roles routes', () => {
  it('GET lists rows when Access is off (legacy admin)', async () => {
    const db = createStatefulDb([{ email: 'v@x.com', role: 'viewer', updatedAt: 't0' }], null);
    const app = new Hono<Env>();
    app.use('*', authMiddleware);
    app.use('*', adminRbacMiddleware);
    app.route('/', adminPrincipalRolesRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/admin/principal-roles', {
        headers: await sessionHeaders(),
      }),
      {
        DB: db,
        API_KEY: 'secret',
      } as never,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: Row[] };
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('GET returns 403 when Access is on but JWT payload has no valid email', async () => {
    const db = createStatefulDb([], null);
    const app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', {});
      await next();
    });
    app.use('*', authMiddleware);
    app.use('*', adminRbacMiddleware);
    app.route('/', adminPrincipalRolesRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/admin/principal-roles', {
        headers: await sessionHeaders(),
      }),
      { ...cfAccessBindings(), DB: db } as never,
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/email/i);
  });

  it('GET returns 403 for viewer principal when Access is enforced', async () => {
    const db = createStatefulDb([], 'viewer@example.com');
    const { app, bindings } = createAccessApp(db, cfAccessBindings(), 'viewer@example.com');

    const res = await app.fetch(
      new Request('http://localhost/api/admin/principal-roles', {
        headers: await sessionHeaders(),
      }),
      {
        ...bindings,
      } as never,
    );

    expect(res.status).toBe(403);
  });

  it('PUT upserts when caller is not viewer', async () => {
    const db = createStatefulDb([], null);
    const { app, bindings } = createAccessApp(db, cfAccessBindings(), 'admin@example.com');

    const res = await app.fetch(
      new Request('http://localhost/api/admin/principal-roles', {
        method: 'PUT',
        headers: { ...(await sessionHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new@x.com', role: 'viewer' }),
      }),
      { ...bindings } as never,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    const list = await app.fetch(
      new Request('http://localhost/api/admin/principal-roles', {
        headers: await sessionHeaders(),
      }),
      { ...bindings } as never,
    );
    const listed = (await list.json()) as { data: Row[] };
    expect(listed.data.some((r) => r.email === 'new@x.com')).toBe(true);
  });

  it('DELETE removes a row', async () => {
    const db = createStatefulDb([{ email: 'a@x.com', role: 'viewer', updatedAt: 't0' }], null);
    const app = new Hono<Env>();
    app.use('*', authMiddleware);
    app.use('*', adminRbacMiddleware);
    app.route('/', adminPrincipalRolesRoutes);

    const res = await app.fetch(
      new Request(`http://localhost/api/admin/principal-roles/${encodeURIComponent('a@x.com')}`, {
        method: 'DELETE',
        headers: await sessionHeaders(),
      }),
      { DB: db, API_KEY: 'secret' } as never,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { removed: boolean } };
    expect(body.data.removed).toBe(true);
  });

  it('PUT returns 400 for invalid role', async () => {
    const db = createStatefulDb([], null);
    const app = new Hono<Env>();
    app.use('*', authMiddleware);
    app.use('*', adminRbacMiddleware);
    app.route('/', adminPrincipalRolesRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/admin/principal-roles', {
        method: 'PUT',
        headers: { ...(await sessionHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.com', role: 'superuser' }),
      }),
      { DB: db, API_KEY: 'secret' } as never,
    );

    expect(res.status).toBe(400);
  });

  it('PUT uses atomic bootstrap when REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST and table empty', async () => {
    const db = createStatefulDb([], null);
    const { app, bindings } = createAccessApp(
      db,
      cfAccessBindings({ REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST: '1' }),
      'admin@example.com',
    );

    const res = await app.fetch(
      new Request('http://localhost/api/admin/principal-roles', {
        method: 'PUT',
        headers: { ...(await sessionHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'first@x.com', role: 'owner' }),
      }),
      { ...bindings } as never,
    );

    expect(res.status).toBe(200);
  });

  it('PUT returns 409 when bootstrap INSERT loses race (table still empty but no row inserted)', async () => {
    const raceDb = {
      prepare(sql: string) {
        if (sql.includes('SELECT COUNT(*)') && sql.includes('admin_principal_roles')) {
          return {
            first: async () => ({ c: 0 }),
          };
        }
        if (sql.includes('SELECT role FROM admin_principal_roles')) {
          return {
            bind() {
              return { first: async () => null };
            },
          };
        }
        if (sql.includes('WHERE NOT EXISTS') && sql.includes('admin_principal_roles')) {
          return {
            bind() {
              return { run: async () => ({ success: true, meta: { changes: 0 } }) };
            },
          };
        }
        if (sql.includes('admin_session_revocations')) {
          return {
            bind() {
              return { first: async () => null };
            },
          };
        }
        throw new Error(`unexpected SQL: ${sql.slice(0, 60)}`);
      },
    } as unknown as D1Database;

    const { app, bindings } = createAccessApp(
      raceDb,
      cfAccessBindings({ REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST: '1' }),
      'admin@example.com',
    );

    const res = await app.fetch(
      new Request('http://localhost/api/admin/principal-roles', {
        method: 'PUT',
        headers: { ...(await sessionHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'late@x.com', role: 'owner' }),
      }),
      { ...bindings } as never,
    );

    expect(res.status).toBe(409);
  });
});
