import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getOperators: vi.fn(),
  getOperatorById: vi.fn(),
  createOperator: vi.fn(),
  updateOperator: vi.fn(),
  deleteOperator: vi.fn(),
  getChats: vi.fn(),
  getChatById: vi.fn(),
  createChat: vi.fn(),
  updateChat: vi.fn(),
  jstNow: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

vi.mock('../../src/services/line-account-routing.js', () => ({
  resolveLineAccessTokenForFriend: vi.fn(),
}));

function createDb() {
  return {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async all<T>() {
              if (sql.includes('FROM chats c')) {
                const [lineAccountId] = bindings as [string];
                return {
                  results: [
                    {
                      id: 'chat-1',
                      friend_id: 'friend-1',
                      display_name: 'Scoped friend',
                      picture_url: null,
                      line_user_id: 'U123',
                      operator_id: null,
                      status: 'unread',
                      notes: null,
                      last_message_at: '2026-03-26T09:00:00+09:00',
                      line_account_id: lineAccountId,
                      created_at: '2026-03-26T08:00:00+09:00',
                      updated_at: '2026-03-26T09:00:00+09:00',
                    },
                  ] as T[],
                };
              }

              throw new Error(`Unexpected SQL: ${sql}`);
            },
            async run() {
              return { success: true };
            },
          };
        },
        async all<T>() {
          if (sql.includes('FROM chats c')) {
            return {
              results: [
                {
                  id: 'chat-1',
                  friend_id: 'friend-1',
                  display_name: 'Scoped friend',
                  picture_url: null,
                  line_user_id: 'U123',
                  operator_id: null,
                  status: 'unread',
                  notes: null,
                  last_message_at: '2026-03-26T09:00:00+09:00',
                  line_account_id: null,
                  created_at: '2026-03-26T08:00:00+09:00',
                  updated_at: '2026-03-26T09:00:00+09:00',
                },
              ] as T[],
            };
          }

          throw new Error(`Unexpected SQL: ${sql}`);
        },
      };
    },
  } as unknown as D1Database;
}

describe('chats routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('filters chats by LINE account and returns lineAccountId in the list response', async () => {
    const { chats } = await import('../../src/routes/chats.js');
    const app = new Hono();
    app.route('/', chats);

    const response = await app.fetch(
      new Request('http://localhost/api/chats?lineAccountId=account-1'),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'chat-1',
          friendId: 'friend-1',
          friendName: 'Scoped friend',
          friendPictureUrl: null,
          operatorId: null,
          status: 'unread',
          notes: null,
          lastMessageAt: '2026-03-26T09:00:00+09:00',
          lineAccountId: 'account-1',
          createdAt: '2026-03-26T08:00:00+09:00',
          updatedAt: '2026-03-26T09:00:00+09:00',
        },
      ],
    });
  });

  it('returns lineAccountId when creating a chat', async () => {
    dbMocks.createChat.mockResolvedValue({
      id: 'chat-1',
      friend_id: 'friend-1',
      operator_id: null,
      status: 'unread',
      notes: null,
      last_message_at: '2026-03-26T09:00:00+09:00',
      line_account_id: null,
      created_at: '2026-03-26T08:00:00+09:00',
      updated_at: '2026-03-26T09:00:00+09:00',
    });

    const { chats } = await import('../../src/routes/chats.js');
    const app = new Hono();
    app.route('/', chats);

    const response = await app.fetch(
      new Request('http://localhost/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendId: 'friend-1',
          lineAccountId: 'account-1',
        }),
      }),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'chat-1',
        friendId: 'friend-1',
        operatorId: null,
        status: 'unread',
        notes: null,
        lastMessageAt: '2026-03-26T09:00:00+09:00',
        lineAccountId: 'account-1',
        createdAt: '2026-03-26T08:00:00+09:00',
        updatedAt: '2026-03-26T09:00:00+09:00',
      },
    });
  });
});
