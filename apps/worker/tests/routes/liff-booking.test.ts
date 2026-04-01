import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getFriendByLineUserId: vi.fn(),
  getLineAccounts: vi.fn(),
}));

vi.mock('@line-crm/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@line-crm/db')>();
  return {
    ...actual,
    getFriendByLineUserId: dbMocks.getFriendByLineUserId,
    getLineAccounts: dbMocks.getLineAccounts,
  };
});

describe('LIFF booking — phone fallback', () => {
  const baseEnv = {
    DB: {} as D1Database,
    API_KEY: 'test-api-key-secret',
    LIFF_URL: 'https://liff.line.me/2009554425-4IMBmLQ9',
    LINE_LOGIN_CHANNEL_ID: 'login-channel-id',
    LINE_LOGIN_CHANNEL_SECRET: 'login-secret',
    LINE_CHANNEL_ACCESS_TOKEN: 'messaging-token',
    WORKER_URL: 'https://worker.example.com',
    WEB_URL: 'https://client.example',
    /** E.164 or tel: URI — shown when LIFF cannot complete online booking */
    BOOKING_FALLBACK_TEL: 'tel:0312345678',
  } as const;

  beforeEach(() => {
    dbMocks.getFriendByLineUserId.mockReset();
    dbMocks.getLineAccounts.mockReset();
    dbMocks.getLineAccounts.mockResolvedValue([]);
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 400 when lineUserId or idToken is missing', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/liff/booking/phone-fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId: 'Ux' }),
      }),
      { ...baseEnv, DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('required'),
    });
  });

  it('returns 503 when BOOKING_FALLBACK_TEL is unset', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const env = { ...baseEnv, BOOKING_FALLBACK_TEL: undefined } as unknown as typeof baseEnv;
    const res = await app.fetch(
      new Request('http://localhost/api/liff/booking/phone-fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId: 'Ux', idToken: 'tok' }),
      }),
      { ...env, DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(503);
  });

  it('returns 401 when ID token subject does not match lineUserId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sub: 'other-user' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/liff/booking/phone-fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId: 'Ux', idToken: 'tok' }),
      }),
      { ...baseEnv, DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(401);
  });

  it('returns 404 when friend is not in DB', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sub: 'Ux' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    dbMocks.getFriendByLineUserId.mockResolvedValue(null);

    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/liff/booking/phone-fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId: 'Ux', idToken: 'tok' }),
      }),
      { ...baseEnv, DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(404);
  });

  it('normalizes plain E.164 to tel: URI in response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sub: 'Ux' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    dbMocks.getFriendByLineUserId.mockResolvedValue({
      id: 'f1',
      line_user_id: 'Ux',
      display_name: 'Alice',
      is_following: 1,
      user_id: null,
    } as never);

    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/liff/booking/phone-fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId: 'Ux', idToken: 'tok' }),
      }),
      {
        ...baseEnv,
        BOOKING_FALLBACK_TEL: '+819012345678',
        DB: {} as D1Database,
      } as never,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        telUri: 'tel:+819012345678',
        message: expect.any(String),
      },
    });
  });

  it('POST /api/liff/booking/phone-fallback returns tel + message after ID token matches friend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sub: 'Ux' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    dbMocks.getFriendByLineUserId.mockResolvedValue({
      id: 'f1',
      line_user_id: 'Ux',
      display_name: 'Alice',
      is_following: 1,
      user_id: null,
    } as never);

    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/liff/booking/phone-fallback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId: 'Ux', idToken: 'tok' }),
      }),
      { ...baseEnv, DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        telUri: 'tel:0312345678',
        message: expect.stringMatching(/電話/),
      },
    });
  });
});
