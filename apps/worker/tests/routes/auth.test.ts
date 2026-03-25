import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

describe('auth routes', () => {
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
      { API_KEY: 'root-api-key' } as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('lh_admin_session=');
    expect(response.headers.get('Set-Cookie')).toContain('HttpOnly');
    const json = await response.json() as {
      success: boolean;
      data?: { expiresAt: string };
    };
    expect(json.success).toBe(true);
    expect(json.data?.expiresAt).toBeTruthy();
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
      { API_KEY: 'root-api-key' } as never,
    );
    const sessionCookie = loginResponse.headers.get('Set-Cookie');
    expect(sessionCookie).toContain('lh_admin_session=');

    const sessionResponse = await app.fetch(
      new Request('http://localhost/api/auth/session', {
        headers: { Cookie: sessionCookie ?? '' },
      }),
      { API_KEY: 'root-api-key' } as never,
    );

    expect(sessionResponse.status).toBe(200);
    const sessionJson = await sessionResponse.json() as { success: boolean; data?: { authenticated: boolean } };
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
      { API_KEY: 'root-api-key' } as never,
    );
    const sessionResponse = await app.fetch(
      new Request('http://localhost/api/auth/session'),
      { API_KEY: 'root-api-key' } as never,
    );

    expect(loginResponse.status).toBe(401);
    expect(sessionResponse.status).toBe(401);
  });

  it('accepts the root API key for session validation to preserve CLI compatibility', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

    const response = await app.fetch(
      new Request('http://localhost/api/auth/session', {
        headers: { Authorization: 'Bearer root-api-key' },
      }),
      { API_KEY: 'root-api-key' } as never,
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
      }),
      { API_KEY: 'root-api-key' } as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('lh_admin_session=');
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
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
      { API_KEY: 'root-api-key' } as never,
    );

    expect(response.status).toBe(413);
  });

  it('rate limits repeated login attempts from the same client', async () => {
    const { authRoutes } = await import('../../src/routes/auth.js');
    const app = new Hono();
    app.route('/', authRoutes);

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
        { API_KEY: 'root-api-key' } as never,
      );
    }

    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBeTruthy();
  });
});
