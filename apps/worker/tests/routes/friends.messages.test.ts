import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getFriends: vi.fn(),
  getFriendById: vi.fn(),
  getFriendCount: vi.fn(),
  addTagToFriend: vi.fn(),
  removeTagFromFriend: vi.fn(),
  getFriendTags: vi.fn(),
  getScenarios: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  jstNow: vi.fn(() => '2026-03-25T10:00:00+09:00'),
  getLineAccountById: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

vi.mock('../../src/services/event-bus.js', () => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
}));

const lineSdkMocks = vi.hoisted(() => ({
  lineClientCtor: vi.fn(),
  pushMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@line-crm/line-sdk', () => ({
  LineClient: vi.fn().mockImplementation((token: string) => {
    lineSdkMocks.lineClientCtor(token);
    return { pushMessage: lineSdkMocks.pushMessage };
  }),
}));

function createDb() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  } as unknown as D1Database;
}

describe('friend message route', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.jstNow.mockReturnValue('2026-03-25T10:00:00+09:00');
    lineSdkMocks.lineClientCtor.mockClear();
    lineSdkMocks.pushMessage.mockClear();
  });

  it('uses the friend account token for direct messages', async () => {
    dbMocks.getFriendById
      .mockResolvedValueOnce({
        id: 'friend-1',
        line_user_id: 'line-user-1',
        line_account_id: 'account-2',
      })
      .mockResolvedValueOnce({
        id: 'friend-1',
        line_user_id: 'line-user-1',
        line_account_id: 'account-2',
      });
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'account-2',
      channel_access_token: 'account-2-token',
    });

    const { friends } = await import('../../src/routes/friends.js');
    const app = new Hono();
    app.route('/', friends);

    const response = await app.fetch(
      new Request('http://localhost/api/friends/friend-1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'hello' }),
      }),
      {
        DB: createDb(),
        LINE_CHANNEL_ACCESS_TOKEN: 'default-token',
      } as never,
    );

    expect(response.status).toBe(200);
    expect(lineSdkMocks.lineClientCtor).toHaveBeenCalledWith('account-2-token');
    expect(lineSdkMocks.pushMessage).toHaveBeenCalledWith('line-user-1', [
      { type: 'text', text: 'hello' },
    ]);
  });
});
