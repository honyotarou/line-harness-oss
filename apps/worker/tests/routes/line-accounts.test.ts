import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getLineAccounts: vi.fn(),
  getLineAccountById: vi.fn(),
  createLineAccount: vi.fn(),
  updateLineAccount: vi.fn(),
  deleteLineAccount: vi.fn(),
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

    const response = await app.fetch(
      new Request('http://localhost/api/line-accounts/account-1'),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(200);
    const json = await response.json() as { success: boolean; data: Record<string, unknown> };
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
    serviceMocks.loadLineAccountProfile.mockImplementation(async (_db: unknown, account: { id: string }) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return {
        displayName: `Profile ${account.id}`,
        pictureUrl: null,
        basicId: null,
      };
    });

    const { lineAccounts } = await import('../../src/routes/line-accounts.js');
    const app = new Hono();
    app.route('/', lineAccounts);

    const response = await app.fetch(
      new Request('http://localhost/api/line-accounts'),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(200);
    expect(serviceMocks.loadLineAccountProfile).toHaveBeenCalledTimes(5);
    expect(peak).toBeLessThanOrEqual(3);
  });
});
