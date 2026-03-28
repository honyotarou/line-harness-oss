import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getFriends: vi.fn(),
  getFriendById: vi.fn(),
  getFriendCount: vi.fn(),
  addTagToFriend: vi.fn(),
  removeTagFromFriend: vi.fn(),
  getFriendTags: vi.fn(),
  getTagsForFriends: vi.fn(),
  getScenarios: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  jstNow: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

function createDb() {
  return {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async all<T>() {
              if (sql.includes('SELECT f.* FROM friends f')) {
                const [lineAccountId] = bindings as [string, number, number];
                return {
                  results: [
                    {
                      id: 'friend-1',
                      line_user_id: 'U123',
                      display_name: 'Scoped friend',
                      picture_url: null,
                      status_message: 'hello',
                      is_following: 1,
                      line_account_id: lineAccountId,
                      metadata: '{"tier":"gold"}',
                      ref_code: 'lp-1',
                      user_id: 'user-1',
                      created_at: '2026-03-25T10:00:00+09:00',
                      updated_at: '2026-03-25T10:00:00+09:00',
                    },
                  ] as T[],
                };
              }

              if (sql.includes('SELECT ref_code, COUNT(*) as count FROM friends')) {
                return {
                  results: [
                    { ref_code: 'lp-1', count: 2 },
                    { ref_code: 'lp-2', count: 1 },
                  ] as T[],
                };
              }

              throw new Error(`Unexpected SQL: ${sql}`);
            },
            async first<T>() {
              if (sql.includes('SELECT COUNT(*) as count FROM friends f')) {
                return { count: 1 } as T;
              }

              if (sql.includes('SELECT COUNT(*) as count FROM friends WHERE line_account_id = ? AND ref_code IS NOT NULL')) {
                return { count: 3 } as T;
              }

              throw new Error(`Unexpected SQL: ${sql}`);
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe('friends routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.getFriendTags.mockResolvedValue([]);
    dbMocks.getTagsForFriends.mockResolvedValue(new Map());
  });

  it('returns account-scoped friends with lineAccountId, metadata, and refCode', async () => {
    const { friends } = await import('../../src/routes/friends.js');
    const app = new Hono();
    app.route('/', friends);

    const response = await app.fetch(
      new Request('http://localhost/api/friends?lineAccountId=account-1&limit=10&offset=0'),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        items: [
          {
            id: 'friend-1',
            lineUserId: 'U123',
            displayName: 'Scoped friend',
            pictureUrl: null,
            statusMessage: 'hello',
            isFollowing: true,
            lineAccountId: 'account-1',
            metadata: { tier: 'gold' },
            refCode: 'lp-1',
            userId: 'user-1',
            createdAt: '2026-03-25T10:00:00+09:00',
            updatedAt: '2026-03-25T10:00:00+09:00',
            tags: [],
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        hasNextPage: false,
      },
    });
  });

  it('uses batch tag query instead of N+1 individual queries', async () => {
    const { friends } = await import('../../src/routes/friends.js');
    const app = new Hono();
    app.route('/', friends);

    await app.fetch(
      new Request('http://localhost/api/friends?lineAccountId=account-1&limit=10&offset=0'),
      { DB: createDb() } as never,
    );

    // getFriendTags (individual per-friend query) should NOT be called
    expect(dbMocks.getFriendTags).not.toHaveBeenCalled();
    // Instead, getTagsForFriends (batch query) should be called once
    expect(dbMocks.getTagsForFriends).toHaveBeenCalledTimes(1);
    expect(dbMocks.getTagsForFriends).toHaveBeenCalledWith(expect.anything(), ['friend-1']);
  });

  it('filters ref code stats by LINE account', async () => {
    const { friends } = await import('../../src/routes/friends.js');
    const app = new Hono();
    app.route('/', friends);

    const response = await app.fetch(
      new Request('http://localhost/api/friends/ref-stats?lineAccountId=account-1'),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        routes: [
          { refCode: 'lp-1', friendCount: 2 },
          { refCode: 'lp-2', friendCount: 1 },
        ],
        totalWithRef: 3,
      },
    });
  });
});
