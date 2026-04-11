import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getLineAccounts: vi.fn(),
  getLineAccountById: vi.fn(),
  createLineAccount: vi.fn(),
  updateLineAccount: vi.fn(),
  deleteLineAccount: vi.fn(),
  listPrincipalLineAccountIdsForEmail: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

const serviceMocks = vi.hoisted(() => ({
  loadLineAccountStats: vi.fn(),
  loadLineAccountProfile: vi.fn(),
}));

vi.mock('../../src/services/line-account-stats.js', () => ({
  loadLineAccountStats: serviceMocks.loadLineAccountStats,
}));

vi.mock('../../src/services/line-account-profile-cache.js', () => ({
  loadLineAccountProfile: serviceMocks.loadLineAccountProfile,
}));

describe('line account routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    Object.values(serviceMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue([]);
  });

  it('does not expose channel secrets in single-account responses', async () => {
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'account-1',
      channel_id: 'channel-1',
      name: 'Main',
      channel_access_token: 'secret-access-token',
      channel_secret: 'secret-channel-secret',
      is_active: 1,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });

    const { lineAccounts } = await import('../../src/routes/line-accounts.js');
    const app = new Hono();
    app.route('/', lineAccounts);

    const response = await app.fetch(new Request('http://localhost/api/line-accounts/account-1'), {
      DB: {} as D1Database,
    } as never);

    expect(response.status).toBe(200);
    const json = (await response.json()) as { success: boolean; data: Record<string, unknown> };
    expect(json.success).toBe(true);
    expect(json.data.channelAccessToken).toBeUndefined();
    expect(json.data.channelSecret).toBeUndefined();
  });

  it('limits concurrent LINE profile lookups when listing accounts', async () => {
    dbMocks.getLineAccounts.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `account-${index + 1}`,
        channel_id: `channel-${index + 1}`,
        name: `Account ${index + 1}`,
        channel_access_token: `token-${index + 1}`,
        channel_secret: `secret-${index + 1}`,
        is_active: 1,
        created_at: '2026-03-25T10:00:00+09:00',
        updated_at: '2026-03-25T10:00:00+09:00',
      })),
    );
    serviceMocks.loadLineAccountStats.mockResolvedValue({});

    let active = 0;
    let peak = 0;
    serviceMocks.loadLineAccountProfile.mockImplementation(
      async (_db: unknown, account: { id: string }) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return {
          displayName: `Profile ${account.id}`,
          pictureUrl: null,
          basicId: null,
        };
      },
    );

    const { lineAccounts } = await import('../../src/routes/line-accounts.js');
    const app = new Hono();
    app.route('/', lineAccounts);

    const response = await app.fetch(new Request('http://localhost/api/line-accounts'), {
      DB: {} as D1Database,
    } as never);

    expect(response.status).toBe(200);
    expect(serviceMocks.loadLineAccountProfile).toHaveBeenCalledTimes(5);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('returns 404 on PUT when Cloudflare-scoped principal cannot access the LINE account', async () => {
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue(['allowed-only']);
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'victim-account',
      channel_id: 'ch-v',
      name: 'Victim',
      channel_access_token: 'tok',
      channel_secret: 'sec',
      is_active: 1,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });

    const { lineAccounts } = await import('../../src/routes/line-accounts.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', lineAccounts);

    const response = await app.fetch(
      new Request('http://localhost/api/line-accounts/victim-account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'pwned' }),
      }),
      {
        DB: {} as D1Database,
        API_KEY: 'k',
        REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      } as never,
    );

    expect(response.status).toBe(404);
    expect(dbMocks.updateLineAccount).not.toHaveBeenCalled();
  });

  it('returns 403 when creating a LINE account under a restricted principal (multi-account scope)', async () => {
    dbMocks.getLineAccounts.mockResolvedValue([
      {
        id: 'a1',
        channel_id: 'c1',
        name: 'A',
        channel_access_token: 't',
        channel_secret: 's',
        is_active: 1,
        created_at: '2026-03-25T10:00:00+09:00',
        updated_at: '2026-03-25T10:00:00+09:00',
      },
      {
        id: 'a2',
        channel_id: 'c2',
        name: 'B',
        channel_access_token: 't',
        channel_secret: 's',
        is_active: 1,
        created_at: '2026-03-25T10:00:00+09:00',
        updated_at: '2026-03-25T10:00:00+09:00',
      },
    ]);

    const { lineAccounts } = await import('../../src/routes/line-accounts.js');
    const app = new Hono();
    app.route('/', lineAccounts);

    const response = await app.fetch(
      new Request('http://localhost/api/line-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: 'new-ch',
          name: 'New',
          channelAccessToken: 't',
          channelSecret: 's',
        }),
      }),
      {
        DB: {} as D1Database,
        API_KEY: 'k',
        MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID: '1',
      } as never,
    );

    expect(response.status).toBe(403);
    expect(dbMocks.createLineAccount).not.toHaveBeenCalled();
  });
});
