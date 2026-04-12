import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

/** Minimal D1 mock: rate limits + `admin_session_revocations` for auth integration tests. */
function createAuthIntegrationDb(): D1Database {
  const revokedJtis = new Set<string>();
  const rateCounts = new Map<string, number>();

  function rateKey(args: unknown[]) {
    return `${String(args[0])}:${String(args[1])}:${String(args[2])}`;
  }

  return {
    prepare(sql: string) {
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              if (norm.includes('admin_session_revocations') && norm.includes('select')) {
                const jti = String(args[0] ?? '');
                return (revokedJtis.has(jti) ? { ok: 1 } : null) as T | null;
              }
              if (norm.includes('request_rate_limits') && norm.includes('count')) {
                const c = rateCounts.get(rateKey(args)) ?? 0;
                return { count: c } as T | null;
              }
              return null;
            },
            async run() {
              if (norm.includes('admin_session_revocations') && norm.includes('insert')) {
                revokedJtis.add(String(args[0] ?? ''));
                return { success: true, meta: {} };
              }
              if (norm.includes('request_rate_limits') && norm.includes('delete')) {
                return { success: true, meta: {} };
              }
              if (norm.includes('request_rate_limits')) {
                if (norm.includes('insert')) {
                  const k = rateKey(args);
                  rateCounts.set(k, (rateCounts.get(k) ?? 0) + 1);
                }
                return { success: true, meta: {} };
              }
              return { success: true, meta: {} };
            },
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe('auth routes', () => {
  beforeEach(async () => {
    const { resetRequestRateLimits } = await import('../../src/services/request-rate-limit.js');
    resetRequestRateLimits();
  });

  it('returns 503 on login when WORKER_URL is public HTTPS but ADMIN_SESSION_SECRET is unset', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const response = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'root-api-key' }),
      }),
      {
        API_KEY: 'root-api-key',
        WORKER_URL: 'https://deployed.workers.dev',
        DB: createAuthIntegrationDb(),
      } as never,
    );

    expect(response.status).toBe(503);
    const json = (await response.json()) as { success: boolean; error?: string };
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/ADMIN_SESSION_SECRET/i);
  });

  it('allows login on public HTTPS Worker when ALLOW_LEGACY_API_KEY_SESSION_SIGNER is on', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const response = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'root-api-key' }),
      }),
      {
        API_KEY: 'root-api-key',
        WORKER_URL: 'https://deployed.workers.dev',
        ALLOW_LEGACY_API_KEY_SESSION_SIGNER: '1',
        DB: createAuthIntegrationDb(),
      } as never,
    );

    expect(response.status).toBe(200);
  });

  it('returns 503 when REQUIRE_ADMIN_SESSION_SECRET is on but ADMIN_SESSION_SECRET is unset', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const response = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'root-api-key' }),
      }),
      {
        API_KEY: 'root-api-key',
        REQUIRE_ADMIN_SESSION_SECRET: '1',
        DB: createAuthIntegrationDb(),
      } as never,
    );

    expect(response.status).toBe(503);
    const json = (await response.json()) as { success: boolean; error?: string };
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/ADMIN_SESSION_SECRET/i);
  });

  it('exchanges the root API key for a signed admin session token', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const response = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'root-api-key' }),
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('lh_admin_session=');
    expect(response.headers.get('Set-Cookie')).toContain('HttpOnly');
    const json = (await response.json()) as {
      success: boolean;
      data?: { expiresAt: string; sessionToken: string };
    };
    expect(json.success).toBe(true);
    expect(json.data?.expiresAt).toBeTruthy();
    expect(json.data?.sessionToken).toBeTruthy();
  });

  it('validates signed admin sessions via the session endpoint using Bearer sessionToken', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const loginResponse = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'root-api-key' }),
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );
    const body = (await loginResponse.json()) as {
      data?: { sessionToken?: string };
    };
    const sessionToken = body.data?.sessionToken;
    expect(sessionToken).toBeTruthy();

    const sessionResponse = await app.fetch(
      new Request('http://localhost/api/auth/session', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );

    expect(sessionResponse.status).toBe(200);
    const sessionJson = (await sessionResponse.json()) as {
      success: boolean;
      data?: { authenticated: boolean };
    };
    expect(sessionJson).toEqual({
      success: true,
      data: { authenticated: true },
    });
  });

  it('accepts case-insensitive Bearer on the session endpoint', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const loginResponse = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'root-api-key' }),
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );
    const body = (await loginResponse.json()) as { data?: { sessionToken?: string } };
    const sessionToken = body.data?.sessionToken;
    expect(sessionToken).toBeTruthy();

    const sessionResponse = await app.fetch(
      new Request('http://localhost/api/auth/session', {
        headers: { Authorization: `bearer ${sessionToken}` },
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );

    expect(sessionResponse.status).toBe(200);
  });

  it('validates signed admin sessions via the session endpoint using cookies', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const loginResponse = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'root-api-key' }),
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );
    const sessionCookie = loginResponse.headers.get('Set-Cookie');
    expect(sessionCookie).toContain('lh_admin_session=');

    const sessionResponse = await app.fetch(
      new Request('http://localhost/api/auth/session', {
        headers: { Cookie: sessionCookie ?? '' },
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );

    expect(sessionResponse.status).toBe(200);
    const sessionJson = (await sessionResponse.json()) as {
      success: boolean;
      data?: { authenticated: boolean };
    };
    expect(sessionJson).toEqual({
      success: true,
      data: { authenticated: true },
    });
  });

  it('rejects invalid login attempts and missing sessions', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const loginResponse = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'wrong-key' }),
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );
    const sessionResponse = await app.fetch(new Request('http://localhost/api/auth/session'), {
      API_KEY: 'root-api-key',
      DB: createAuthIntegrationDb(),
    } as never);

    expect(loginResponse.status).toBe(401);
    expect(sessionResponse.status).toBe(401);
  });

  it('rejects raw API key on the session endpoint by default', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const response = await app.fetch(
      new Request('http://localhost/api/auth/session', {
        headers: { Authorization: 'Bearer root-api-key' },
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );

    expect(response.status).toBe(401);
  });

  it('signs login sessions with ADMIN_SESSION_SECRET when set (not with API_KEY)', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const { verifyAdminSessionToken } = await import('../../src/services/admin-session.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const loginResponse = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'root-api-key' }),
      }),
      {
        API_KEY: 'root-api-key',
        ADMIN_SESSION_SECRET: 'only-for-sessions',
        DB: createAuthIntegrationDb(),
      } as never,
    );
    expect(loginResponse.status).toBe(200);
    const loginJson = (await loginResponse.json()) as { data?: { sessionToken?: string } };
    const sessionToken = loginJson.data?.sessionToken;
    expect(sessionToken).toBeTruthy();

    await expect(
      verifyAdminSessionToken('root-api-key', sessionToken!, {
        now: Math.floor(Date.now() / 1000),
      }),
    ).resolves.toBeNull();
    await expect(
      verifyAdminSessionToken('only-for-sessions', sessionToken!, {
        now: Math.floor(Date.now() / 1000),
      }),
    ).resolves.toMatchObject({ scope: 'admin' });

    const sessionResponse = await app.fetch(
      new Request('http://localhost/api/auth/session', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      }),
      {
        API_KEY: 'root-api-key',
        ADMIN_SESSION_SECRET: 'only-for-sessions',
        DB: createAuthIntegrationDb(),
      } as never,
    );
    expect(sessionResponse.status).toBe(200);
  });

  it('allows Bearer raw API key on session only when ALLOW_LEGACY_API_KEY_BEARER_SESSION is enabled', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const response = await app.fetch(
      new Request('http://localhost/api/auth/session', {
        headers: { Authorization: 'Bearer root-api-key' },
      }),
      {
        API_KEY: 'root-api-key',
        ALLOW_LEGACY_API_KEY_BEARER_SESSION: '1',
        DB: createAuthIntegrationDb(),
      } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { authenticated: true },
    });
  });

  it('clears the admin session cookie on logout', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const response = await app.fetch(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { 'X-Line-Harness-Client': '1' },
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('lh_admin_session=');
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('returns 403 on logout when session cookie is sent without browser client header (CSRF)', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const loginResponse = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'root-api-key' }),
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );
    const cookie = loginResponse.headers.get('Set-Cookie') ?? '';

    const response = await app.fetch(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );

    expect(response.status).toBe(403);
  });

  it('allows logout with session cookie when X-Line-Harness-Client is present', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const loginResponse = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'root-api-key' }),
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );
    const cookie = loginResponse.headers.get('Set-Cookie') ?? '';

    const response = await app.fetch(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { Cookie: cookie, 'X-Line-Harness-Client': '1' },
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );

    expect(response.status).toBe(200);
  });

  it('revokes the session in D1 on logout so the same token fails session check', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);
    const db = createAuthIntegrationDb();

    const loginResponse = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'root-api-key' }),
      }),
      { API_KEY: 'root-api-key', DB: db } as never,
    );
    expect(loginResponse.status).toBe(200);
    const loginJson = (await loginResponse.json()) as { data?: { sessionToken?: string } };
    const sessionToken = loginJson.data?.sessionToken;
    expect(sessionToken).toBeTruthy();
    const cookie = loginResponse.headers.get('Set-Cookie') ?? '';

    const sessionBefore = await app.fetch(
      new Request('http://localhost/api/auth/session', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      }),
      { API_KEY: 'root-api-key', DB: db } as never,
    );
    expect(sessionBefore.status).toBe(200);

    await app.fetch(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { Cookie: cookie, 'X-Line-Harness-Client': '1' },
      }),
      { API_KEY: 'root-api-key', DB: db } as never,
    );

    const sessionAfter = await app.fetch(
      new Request('http://localhost/api/auth/session', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      }),
      { API_KEY: 'root-api-key', DB: db } as never,
    );
    expect(sessionAfter.status).toBe(401);
  });

  it('rejects oversized login payloads before parsing them', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const payload = JSON.stringify({ apiKey: 'x'.repeat(10_000) });
    const response = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(payload.length),
        },
        body: payload,
      }),
      { API_KEY: 'root-api-key', DB: createAuthIntegrationDb() } as never,
    );

    expect(response.status).toBe(413);
  });

  it('rate limits repeated session checks from the same client', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);
    const rateDb = createAuthIntegrationDb();

    const loginResponse = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'root-api-key' }),
      }),
      { API_KEY: 'root-api-key', DB: rateDb } as never,
    );
    const body = (await loginResponse.json()) as { data?: { sessionToken?: string } };
    const sessionToken = body.data?.sessionToken;
    expect(sessionToken).toBeTruthy();

    let lastStatus = 200;
    for (let i = 0; i < 121; i += 1) {
      const res = await app.fetch(
        new Request('http://localhost/api/auth/session', {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            'CF-Connecting-IP': '198.51.100.77',
          },
        }),
        { API_KEY: 'root-api-key', DB: rateDb } as never,
      );
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });

  it('rate limits repeated login attempts from the same client', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);
    const rateDb = createAuthIntegrationDb();

    let response: Response | undefined;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      response = await app.fetch(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '198.51.100.10',
          },
          body: JSON.stringify({ apiKey: 'wrong-key' }),
        }),
        { API_KEY: 'root-api-key', DB: rateDb } as never,
      );
    }

    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBeTruthy();
  });
});
