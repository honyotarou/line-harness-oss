import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getFriendById: vi.fn(),
  getLineAccountById: vi.fn(),
}));

vi.mock('@line-crm/db', () => ({
  getFriendById: dbMocks.getFriendById,
  getLineAccountById: dbMocks.getLineAccountById,
}));

describe('line account routing helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    dbMocks.getFriendById.mockReset();
    dbMocks.getLineAccountById.mockReset();
  });

  it('uses the friend account token when the friend belongs to a non-default account', async () => {
    dbMocks.getFriendById.mockResolvedValue({ id: 'friend-1', line_account_id: 'account-1' });
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'account-1',
      channel_access_token: 'account-token',
    });

    const { resolveLineAccessTokenForFriend } = await import(
      '../../src/services/line-account-routing.js'
    );

    await expect(
      resolveLineAccessTokenForFriend({} as D1Database, 'default-token', 'friend-1'),
    ).resolves.toBe('account-token');
  });

  it('falls back to the default token when the friend is unassigned or the account is missing', async () => {
    const { resolveLineAccessTokenForFriend } = await import(
      '../../src/services/line-account-routing.js'
    );

    dbMocks.getFriendById.mockResolvedValueOnce({ id: 'friend-1', line_account_id: null });
    await expect(
      resolveLineAccessTokenForFriend({} as D1Database, 'default-token', 'friend-1'),
    ).resolves.toBe('default-token');

    dbMocks.getFriendById.mockResolvedValueOnce({
      id: 'friend-2',
      line_account_id: 'missing-account',
    });
    dbMocks.getLineAccountById.mockResolvedValueOnce(null);
    await expect(
      resolveLineAccessTokenForFriend({} as D1Database, 'default-token', 'friend-2'),
    ).resolves.toBe('default-token');
  });
});
