import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getFriendByLineUserId: vi.fn(),
  createUser: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  getLineAccounts: vi.fn(),
  linkFriendToUser: vi.fn(),
  upsertFriend: vi.fn(),
  getEntryRouteByRefCode: vi.fn(),
  recordRefTracking: vi.fn(),
  addTagToFriend: vi.fn(),
  getLineAccountByChannelId: vi.fn(),
  getScenarios: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  getScenarioSteps: vi.fn(),
  jstNow: vi.fn(() => '2026-03-26T12:00:00+09:00'),
}));

vi.mock('@line-crm/db', () => dbMocks);

const lineSdkMocks = vi.hoisted(() => ({
  pushMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@line-crm/line-sdk', () => ({
  LineClient: vi.fn().mockImplementation(() => ({
    pushMessage: lineSdkMocks.pushMessage,
  })),
}));

vi.mock('../../src/services/step-delivery.js', () => ({
  buildMessage: vi.fn(() => ({ type: 'text' as const, text: 'welcome' })),
  expandVariables: vi.fn((content: string) => content),
}));

function createLiffDb(): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            run: vi.fn().mockResolvedValue(undefined),
            first: vi.fn(async <T>() => {
              if (sql.includes('metadata FROM friends')) {
                return { metadata: '{}' } as T;
              }
              if (sql.includes('friend_scenarios')) {
                return null as T;
              }
              if (sql.includes('entry_routes WHERE ref_code')) {
                return null as T;
              }
              return null as T;
            }),
            all: vi.fn().mockResolvedValue({ results: [] }),
          };
        },
      };
    },
  } as unknown as D1Database;
}

function createLiffDbCorruptFriendMetadata(): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            run: vi.fn().mockResolvedValue(undefined),
            first: vi.fn(async <T>() => {
              if (sql.includes('metadata FROM friends')) {
                return { metadata: '{bad' } as T;
              }
              if (sql.includes('friend_scenarios')) {
                return null as T;
              }
              if (sql.includes('entry_routes WHERE ref_code')) {
                return null as T;
              }
              return null as T;
            }),
            all: vi.fn().mockResolvedValue({ results: [] }),
          };
        },
      };
    },
  } as unknown as D1Database;
}

function lineOAuthFetchSuccess(verified: { sub: string; email?: string; name?: string }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
    if (url.includes('/oauth2/v2.1/token')) {
      return new Response(
        JSON.stringify({
          access_token: 'at',
          id_token: 'jwt.header.payload',
          token_type: 'Bearer',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    if (url.includes('/oauth2/v2.1/verify')) {
      return new Response(JSON.stringify(verified), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/v2/profile')) {
      return new Response(
        JSON.stringify({
          userId: verified.sub,
          displayName: verified.name ?? 'LINE User',
          pictureUrl: 'https://p.example/x',
        }),
        { status: 200 },
      );
    }
    if (url.includes('/v2/bot/info')) {
      return new Response(JSON.stringify({ basicId: '@botx' }), { status: 200 });
    }
    return new Response('unexpected', { status: 404 });
  });
}

const STATE_SECRET = 'test-api-key-secret';

const baseEnv = {
  DB: {} as D1Database,
  API_KEY: STATE_SECRET,
  LIFF_URL: 'https://liff.line.me/2009554425-4IMBmLQ9',
  LINE_LOGIN_CHANNEL_ID: 'login-channel-id',
  LINE_LOGIN_CHANNEL_SECRET: 'login-secret',
  LINE_CHANNEL_ACCESS_TOKEN: 'messaging-token',
  WORKER_URL: 'https://worker.example.com',
  WEB_URL: 'https://client.example',
} as const;

async function signedOAuthState(
  overrides: Partial<{
    ref: string;
    redirect: string;
    gclid: string;
    fbclid: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    utmContent: string;
    utmTerm: string;
    account: string;
    uid: string;
  }> = {},
) {
  const { signLiffOAuthState } = await import('../../src/services/liff-oauth-state.js');
  return signLiffOAuthState(
    {
      ref: '',
      redirect: '',
      gclid: '',
      fbclid: '',
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      utmContent: '',
      utmTerm: '',
      account: '',
      uid: '',
      ...overrides,
    },
    STATE_SECRET,
  );
}

describe('liff auth routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.getLineAccounts.mockResolvedValue([]);
    dbMocks.getScenarios.mockResolvedValue([]);
    dbMocks.getScenarioSteps.mockResolvedValue([]);
    dbMocks.getUserById.mockResolvedValue(null);
    lineSdkMocks.pushMessage.mockClear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves redirect and attribution params in the mobile LIFF redirect', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const response = await app.fetch(
      new Request(
        'http://localhost/auth/line?ref=ref-1&redirect=https%3A%2F%2Fexample.com%2Fdone&gclid=g-1&fbclid=fb-1&utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_content=banner&utm_term=crm&uid=user-1',
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
        },
      ),
      {
        ...baseEnv,
        DB: {} as D1Database,
      } as never,
    );

    expect(response.status).toBe(302);

    const target = new URL(response.headers.get('Location')!);
    expect(target.origin + target.pathname).toBe('https://liff.line.me/2009554425-4IMBmLQ9');
    expect(target.searchParams.get('liffId')).toBe('2009554425-4IMBmLQ9');
    expect(target.searchParams.get('ref')).toBe('ref-1');
    expect(target.searchParams.get('redirect')).toBe('https://example.com/done');
    expect(target.searchParams.get('gclid')).toBe('g-1');
    expect(target.searchParams.get('fbclid')).toBe('fb-1');
    expect(target.searchParams.get('utm_source')).toBe('google');
    expect(target.searchParams.get('utm_medium')).toBe('cpc');
    expect(target.searchParams.get('utm_campaign')).toBe('spring');
    expect(target.searchParams.get('utm_content')).toBe('banner');
    expect(target.searchParams.get('utm_term')).toBe('crm');
    expect(target.searchParams.get('uid')).toBe('user-1');
  });

  it('returns error HTML when LIFF_URL is a placeholder (YOUR_LIFF_ID)', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const response = await app.fetch(new Request('http://localhost/auth/line'), {
      ...baseEnv,
      LIFF_URL: 'https://liff.line.me/YOUR_LIFF_ID',
    } as never);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('LIFF_URL');
    expect(html).toContain('設定');
  });

  it('uses OAuth for cross-account mobile links and preserves signed attribution state', async () => {
    dbMocks.getLineAccountByChannelId.mockResolvedValue({
      id: 'account-1',
      channel_id: 'channel-1',
      name: 'Cross Account',
      channel_access_token: 'token-1',
      channel_secret: 'secret-1',
      login_channel_id: 'login-channel-2',
      login_channel_secret: 'login-secret-2',
      liff_id: '3000000000-CrossAcct',
      is_active: 1,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });

    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const response = await app.fetch(
      new Request(
        'http://localhost/auth/line?account=channel-1&ref=ref-2&redirect=https%3A%2F%2Fexample.com%2Fcross&utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_content=hero&utm_term=crm',
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (Android 14; Mobile)' },
        },
      ),
      {
        ...baseEnv,
        DB: {} as D1Database,
      } as never,
    );

    expect(response.status).toBe(302);

    const loginUrl = new URL(response.headers.get('Location')!);
    expect(loginUrl.origin + loginUrl.pathname).toBe(
      'https://access.line.me/oauth2/v2.1/authorize',
    );
    expect(loginUrl.searchParams.get('client_id')).toBe('login-channel-2');

    const rawState = loginUrl.searchParams.get('state')!;
    const { verifyLiffOAuthState } = await import('../../src/services/liff-oauth-state.js');
    const state = await verifyLiffOAuthState(rawState, STATE_SECRET);
    expect(state).not.toBeNull();
    expect(state!.account).toBe('channel-1');
    expect(state!.ref).toBe('ref-2');
    expect(state!.redirect).toBe('https://example.com/cross');
    expect(state!.utmSource).toBe('google');
    expect(state!.utmMedium).toBe('cpc');
    expect(state!.utmCampaign).toBe('spring');
    expect(state!.utmContent).toBe('hero');
    expect(state!.utmTerm).toBe('crm');
  });

  it('serves a QR landing page for desktop /auth/line', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const response = await app.fetch(
      new Request('http://localhost/auth/line?ref=lp1', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120' },
      }),
      { ...baseEnv, DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('QR');
    expect(html).toContain(encodeURIComponent('https://liff.line.me/2009554425-4IMBmLQ9'));
  });

  it('returns error HTML when LIFF_URL is missing and account query is omitted', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const response = await app.fetch(
      new Request('http://localhost/auth/line?ref=dashboard', {
        headers: { 'User-Agent': 'Mozilla/5.0 iPhone' },
      }),
      { ...baseEnv, LIFF_URL: '', DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('LIFF_URL');
  });

  it('renders an error page when OAuth returns an error on /auth/callback', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const response = await app.fetch(
      new Request('http://localhost/auth/callback?error=access_denied&error_description=nope'),
      { ...baseEnv, DB: createLiffDb() } as never,
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('エラー');
    expect(html).toContain('access_denied');
  });

  it('renders an error page when /auth/callback is missing code', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const response = await app.fetch(new Request('http://localhost/auth/callback'), {
      ...baseEnv,
      DB: createLiffDb(),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Authorization failed');
  });

  it('completes /auth/callback: token exchange, upserts friend, creates user, and shows completion HTML', async () => {
    vi.stubGlobal(
      'fetch',
      lineOAuthFetchSuccess({ sub: 'U-line-1', email: 'taro@example.com', name: 'Taro' }),
    );

    dbMocks.upsertFriend.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'U-line-1',
      display_name: 'Taro',
      picture_url: null,
      status_message: null,
      is_following: 1,
      ref_code: null,
      metadata: null,
      user_id: null,
      line_account_id: null,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    } as never);

    dbMocks.createUser.mockResolvedValue({ id: 'user-new-1' } as never);

    const state = await signedOAuthState();
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const response = await app.fetch(
      new Request(
        `http://localhost/auth/callback?code=auth-code-xyz&state=${encodeURIComponent(state)}`,
      ),
      { ...baseEnv, DB: createLiffDb() } as never,
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('登録完了');
    expect(dbMocks.upsertFriend).toHaveBeenCalled();
    expect(dbMocks.createUser).toHaveBeenCalled();
    expect(dbMocks.linkFriendToUser).toHaveBeenCalledWith(
      expect.anything(),
      'friend-1',
      'user-new-1',
    );
  });

  it('completes /auth/callback when merging ad params over corrupt friend metadata JSON', async () => {
    vi.stubGlobal(
      'fetch',
      lineOAuthFetchSuccess({ sub: 'U-line-ad', email: 'ad@example.com', name: 'AdUser' }),
    );

    dbMocks.upsertFriend.mockResolvedValue({
      id: 'friend-ad',
      line_user_id: 'U-line-ad',
      display_name: 'AdUser',
      picture_url: null,
      status_message: null,
      is_following: 1,
      ref_code: null,
      metadata: null,
      user_id: null,
      line_account_id: null,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    } as never);

    dbMocks.createUser.mockResolvedValue({ id: 'user-ad-1' } as never);

    const state = await signedOAuthState({ gclid: 'gc-corrupt-meta' });
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const response = await app.fetch(
      new Request(
        `http://localhost/auth/callback?code=auth-code-ad&state=${encodeURIComponent(state)}`,
      ),
      { ...baseEnv, DB: createLiffDbCorruptFriendMetadata() } as never,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('登録完了');
  });

  it('redirects after /auth/callback when state contains redirect', async () => {
    vi.stubGlobal('fetch', lineOAuthFetchSuccess({ sub: 'U-line-2', name: 'Hanako' }));

    dbMocks.upsertFriend.mockResolvedValue({
      id: 'friend-2',
      line_user_id: 'U-line-2',
      display_name: 'Hanako',
      picture_url: null,
      status_message: null,
      is_following: 1,
      ref_code: null,
      metadata: null,
      user_id: 'existing-user',
      line_account_id: null,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    } as never);

    const state = await signedOAuthState({ redirect: 'https://client.example/after' });
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const response = await app.fetch(
      new Request(`http://localhost/auth/callback?code=code-2&state=${encodeURIComponent(state)}`),
      { ...baseEnv, DB: createLiffDb() } as never,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://client.example/after');
  });

  it('returns an error HTML when token exchange fails on /auth/callback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : input.toString();
        if (url.includes('/oauth2/v2.1/token')) {
          return new Response('bad', { status: 400 });
        }
        return new Response('', { status: 500 });
      }),
    );

    const state = await signedOAuthState();
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const response = await app.fetch(
      new Request(`http://localhost/auth/callback?code=bad&state=${encodeURIComponent(state)}`),
      { ...baseEnv, DB: createLiffDb() } as never,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Token exchange failed');
  });

  it('rejects tampered OAuth state on /auth/callback', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const response = await app.fetch(
      new Request(
        `http://localhost/auth/callback?code=abc&state=${encodeURIComponent('not.valid.sig')}`,
      ),
      { ...baseEnv, DB: createLiffDb() } as never,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Invalid or expired login state');
  });
});

describe('liff public API routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.getLineAccounts.mockResolvedValue([]);
    dbMocks.getUserById.mockResolvedValue(null);
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POST /api/liff/profile validates lineUserId and idToken', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/liff/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId: 'Ux' }),
      }),
      { ...baseEnv, DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ success: false });
  });

  it('POST /api/liff/profile returns 401 when id token sub mismatches lineUserId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sub: 'U-other' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/liff/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId: 'Ux', idToken: 'tok' }),
      }),
      { ...baseEnv, DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(401);
  });

  it('POST /api/liff/profile returns 404 when friend is unknown', async () => {
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
      new Request('http://localhost/api/liff/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId: 'Ux', idToken: 'tok' }),
      }),
      { ...baseEnv, DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(404);
  });

  it('POST /api/liff/profile returns friend payload when token matches', async () => {
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
      user_id: 'uuid-1',
    } as never);

    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/liff/profile', {
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
        id: 'f1',
        displayName: 'Alice',
        isFollowing: true,
        userId: 'uuid-1',
      },
    });
  });

  it('POST /api/liff/link requires idToken', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/liff/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { ...baseEnv, DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(400);
  });

  it('POST /api/liff/link rejects invalid ID token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 401 })));

    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/liff/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'bad.jwt' }),
      }),
      { ...baseEnv, DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ success: false, error: 'Invalid ID token' });
  });

  it('POST /api/liff/link returns 404 when LINE sub is not a known friend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sub: 'U-unknown' }), {
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
      new Request('http://localhost/api/liff/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'tok' }),
      }),
      { ...baseEnv, DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(404);
  });

  it('POST /api/liff/link returns alreadyLinked when friend has user_id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sub: 'U1', email: 'a@b.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const db = {
      prepare() {
        return {
          bind() {
            return { run: vi.fn().mockResolvedValue(undefined) };
          },
        };
      },
    } as unknown as D1Database;

    dbMocks.getFriendByLineUserId.mockResolvedValue({
      id: 'f1',
      line_user_id: 'U1',
      user_id: 'u-existing',
    } as never);

    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/liff/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'tok', ref: 'ref99' }),
      }),
      { ...baseEnv, DB: db } as never,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { userId: 'u-existing', alreadyLinked: true },
    });
  });

  it('POST /api/liff/link reuses existingUuid when verified email matches that user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sub: 'U1', email: 'recover@example.com', name: 'R' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const db = {
      prepare() {
        return {
          bind() {
            return { run: vi.fn().mockResolvedValue(undefined) };
          },
        };
      },
    } as unknown as D1Database;

    dbMocks.getFriendByLineUserId.mockResolvedValue({
      id: 'f1',
      line_user_id: 'U1',
      user_id: null,
    } as never);
    dbMocks.getUserByEmail.mockResolvedValue(null);
    dbMocks.getUserById.mockResolvedValue({
      id: 'uuid-saved',
      email: 'recover@example.com',
      phone: null,
      external_id: null,
      display_name: 'Old',
      created_at: 't',
      updated_at: 't',
    });

    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/liff/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'tok', existingUuid: 'uuid-saved' }),
      }),
      { ...baseEnv, DB: db } as never,
    );

    expect(res.status).toBe(200);
    expect(dbMocks.createUser).not.toHaveBeenCalled();
    expect(dbMocks.linkFriendToUser).toHaveBeenCalledWith(expect.anything(), 'f1', 'uuid-saved');
  });

  it('POST /api/liff/link ignores existingUuid when saved user email does not match token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sub: 'U1', email: 'new@example.com', name: 'R' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const db = {
      prepare() {
        return {
          bind() {
            return { run: vi.fn().mockResolvedValue(undefined) };
          },
        };
      },
    } as unknown as D1Database;

    dbMocks.getFriendByLineUserId.mockResolvedValue({
      id: 'f1',
      line_user_id: 'U1',
      user_id: null,
    } as never);
    dbMocks.getUserByEmail.mockResolvedValue(null);
    dbMocks.getUserById.mockResolvedValue({
      id: 'uuid-saved',
      email: 'other@example.com',
      phone: null,
      external_id: null,
      display_name: 'X',
      created_at: 't',
      updated_at: 't',
    });
    dbMocks.createUser.mockResolvedValue({
      id: 'uuid-new',
      email: 'new@example.com',
      phone: null,
      external_id: null,
      display_name: 'R',
      created_at: 't',
      updated_at: 't',
    });

    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/liff/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'tok', existingUuid: 'uuid-saved' }),
      }),
      { ...baseEnv, DB: db } as never,
    );

    expect(res.status).toBe(200);
    expect(dbMocks.createUser).toHaveBeenCalled();
    expect(dbMocks.linkFriendToUser).toHaveBeenCalledWith(expect.anything(), 'f1', 'uuid-new');
  });

  it('GET /api/analytics/ref-summary aggregates friends and refs', async () => {
    const db = {
      prepare(sql: string) {
        const stmt = {
          bind(..._args: unknown[]) {
            return stmt;
          },
          async all<T>() {
            if (sql.includes('entry_routes')) {
              return {
                results: [
                  {
                    ref_code: 'r1',
                    name: 'Route1',
                    friend_count: 2,
                    click_count: 5,
                    latest_at: '2026-01-01',
                  },
                ] as T[],
              };
            }
            return { results: [] as T[] };
          },
          async first<T>() {
            if (sql.includes(`ref_code IS NOT NULL`)) {
              return { count: 4 } as T;
            }
            if (sql.includes('COUNT(*) as count FROM friends')) {
              return { count: 10 } as T;
            }
            return null as T;
          },
        };
        return stmt;
      },
    } as unknown as D1Database;

    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(new Request('http://localhost/api/analytics/ref-summary'), {
      ...baseEnv,
      DB: db,
    } as never);

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { routes: unknown[]; totalFriends: number };
    };
    expect(json.success).toBe(true);
    expect(json.data.totalFriends).toBe(10);
    expect(json.data.routes).toHaveLength(1);
  });

  it('GET /api/analytics/ref/:refCode returns 404 for unknown ref', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                return null;
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(new Request('http://localhost/api/analytics/ref/missing'), {
      ...baseEnv,
      DB: db,
    } as never);

    expect(res.status).toBe(404);
  });

  it('GET /api/analytics/ref/:refCode returns friend rows', async () => {
    const db = {
      prepare(sql: string) {
        return {
          bind(..._args: unknown[]) {
            return {
              async first<T>() {
                if (sql.includes('entry_routes')) {
                  return { ref_code: 'r1', name: 'N1' } as T;
                }
                return null as T;
              },
              async all<T>() {
                return {
                  results: [
                    { id: 'f1', display_name: 'A', ref_code: 'r1', tracked_at: '2026-01-01' },
                  ] as T[],
                };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(new Request('http://localhost/api/analytics/ref/r1'), {
      ...baseEnv,
      DB: db,
    } as never);

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { friends: { id: string }[] } };
    expect(json.data.friends).toHaveLength(1);
    expect(json.data.friends[0].id).toBe('f1');
  });

  it('POST /api/links/wrap validates url and returns wrapped LIFF URL', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/links/wrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/page', ref: 'ad1' }),
      }),
      { ...baseEnv, DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { url: string } };
    expect(json.data.url).toContain('liff.line.me');
    expect(json.data.url).toContain('redirect=');
    expect(json.data.url).toContain('ref=ad1');
  });

  it('POST /api/links/wrap returns 400 without url', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/links/wrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'x' }),
      }),
      { ...baseEnv, DB: {} as D1Database } as never,
    );

    expect(res.status).toBe(400);
  });

  it('POST /api/links/wrap returns 500 when LIFF_URL is missing', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const res = await app.fetch(
      new Request('http://localhost/api/links/wrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://a.com' }),
      }),
      {
        ...baseEnv,
        LIFF_URL: undefined,
        DB: {} as D1Database,
      } as never,
    );

    expect(res.status).toBe(500);
  });
});
