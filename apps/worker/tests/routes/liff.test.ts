import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getFriendByLineUserId: vi.fn(),
  createUser: vi.fn(),
  getUserByEmail: vi.fn(),
  linkFriendToUser: vi.fn(),
  upsertFriend: vi.fn(),
  getEntryRouteByRefCode: vi.fn(),
  recordRefTracking: vi.fn(),
  addTagToFriend: vi.fn(),
  getLineAccountByChannelId: vi.fn(),
  getLineAccounts: vi.fn(),
  jstNow: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

describe('liff auth routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('preserves redirect and attribution params in the mobile LIFF redirect', async () => {
    const { liffRoutes } = await import('../../src/routes/liff.js');
    const app = new Hono();
    app.route('/', liffRoutes);

    const response = await app.fetch(
      new Request('http://localhost/auth/line?ref=ref-1&redirect=https%3A%2F%2Fexample.com%2Fdone&gclid=g-1&fbclid=fb-1&utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_content=banner&utm_term=crm&uid=user-1', {
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
      }),
      {
        DB: {} as D1Database,
        LIFF_URL: 'https://liff.line.me/2009554425-4IMBmLQ9',
        LINE_LOGIN_CHANNEL_ID: 'login-channel-id',
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

  it('uses OAuth for cross-account mobile links and preserves attribution state', async () => {
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
      new Request('http://localhost/auth/line?account=channel-1&ref=ref-2&redirect=https%3A%2F%2Fexample.com%2Fcross&utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_content=hero&utm_term=crm', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Android 14; Mobile)' },
      }),
      {
        DB: {} as D1Database,
        LIFF_URL: 'https://liff.line.me/2009554425-4IMBmLQ9',
        LINE_LOGIN_CHANNEL_ID: 'login-channel-id',
      } as never,
    );

    expect(response.status).toBe(302);

    const loginUrl = new URL(response.headers.get('Location')!);
    expect(loginUrl.origin + loginUrl.pathname).toBe('https://access.line.me/oauth2/v2.1/authorize');
    expect(loginUrl.searchParams.get('client_id')).toBe('login-channel-2');

    const state = JSON.parse(Buffer.from(loginUrl.searchParams.get('state')!, 'base64').toString('utf8')) as Record<string, string>;
    expect(state.account).toBe('channel-1');
    expect(state.ref).toBe('ref-2');
    expect(state.redirect).toBe('https://example.com/cross');
    expect(state.utmSource).toBe('google');
    expect(state.utmMedium).toBe('cpc');
    expect(state.utmCampaign).toBe('spring');
    expect(state.utmContent).toBe('hero');
    expect(state.utmTerm).toBe('crm');
  });
});
