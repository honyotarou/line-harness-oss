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
  getFriendById: vi.fn(),
  jstNow: vi.fn(),
  listPrincipalLineAccountIdsForEmail: vi.fn(),
  getLineAccounts: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

vi.mock('../../src/services/line-account-routing.js', () => ({
  resolveLineAccessTokenForFriend: vi.fn().mockResolvedValue('line-token'),
}));

vi.mock('@line-crm/line-sdk', () => ({
  LineClient: vi.fn().mockImplementation(() => ({
    pushTextMessage: vi.fn().mockResolvedValue(undefined),
    pushFlexMessage: vi.fn().mockResolvedValue(undefined),
  })),
}));

function createDb() {
  return {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async all<T>() {
              if (sql.includes('FROM chats c')) {
                const [lineAccountId] = bindings as [string, ...unknown[]];
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

const cfEnv = {
  DB: {} as D1Database,
  REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
} as const;

describe('chats routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue([]);
    dbMocks.getLineAccounts.mockResolvedValue([]);
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

  it('V-5 / P6: returns 404 for GET /api/chats/:id when friend LINE account is outside scope', async () => {
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue(['allowed-account']);
    dbMocks.getChatById.mockResolvedValue({
      id: 'chat-out',
      friend_id: 'friend-out',
      operator_id: null,
      status: 'unread',
      notes: null,
      last_message_at: '2026-03-26T09:00:00+09:00',
      line_account_id: null,
      created_at: '2026-03-26T08:00:00+09:00',
      updated_at: '2026-03-26T09:00:00+09:00',
    });
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-out',
      line_user_id: 'U-out',
      line_account_id: 'other-account',
    });

    const detailDb = {
      prepare(sql: string) {
        return {
          bind(..._bindings: unknown[]) {
            return {
              async first() {
                if (sql.includes('FROM friends WHERE id')) {
                  return { display_name: 'X', picture_url: null, line_user_id: 'U-out' };
                }
                return null;
              },
              async all() {
                return { results: [] };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const { chats } = await import('../../src/routes/chats.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', chats);

    const response = await app.fetch(new Request('http://localhost/api/chats/chat-out'), {
      ...cfEnv,
      DB: detailDb,
    } as never);

    expect(response.status).toBe(404);
  });

  it('returns lineAccountId when creating a chat', async () => {
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'U-line',
      line_account_id: 'account-1',
    });
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

  it('returns 400 when operator sends flex with invalid JSON content', async () => {
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'U999',
      line_account_id: null,
    });
    dbMocks.getChatById.mockResolvedValue({
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
    const sendDb = {
      prepare(sql: string) {
        return {
          bind(..._bindings: unknown[]) {
            return {
              async first() {
                if (sql.includes('FROM friends WHERE id')) {
                  return { id: 'friend-1', line_user_id: 'U999' };
                }
                return null;
              },
              async run() {
                return { success: true };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const { chats } = await import('../../src/routes/chats.js');
    const app = new Hono();
    app.route('/', chats);

    const response = await app.fetch(
      new Request('http://localhost/api/chats/chat-1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageType: 'flex',
          content: '{not-json',
        }),
      }),
      { DB: sendDb } as never,
    );

    expect(response.status).toBe(400);
    const json = (await response.json()) as { success: boolean; error?: string };
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/flex|JSON/i);
  });

  it('returns 400 when flex content parses to a non-object JSON value', async () => {
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'U999',
      line_account_id: null,
    });
    dbMocks.getChatById.mockResolvedValue({
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
    const sendDb = {
      prepare(sql: string) {
        return {
          bind(..._bindings: unknown[]) {
            return {
              async first() {
                if (sql.includes('FROM friends WHERE id')) {
                  return { id: 'friend-1', line_user_id: 'U999' };
                }
                return null;
              },
              async run() {
                return { success: true };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const { chats } = await import('../../src/routes/chats.js');
    const app = new Hono();
    app.route('/', chats);

    const response = await app.fetch(
      new Request('http://localhost/api/chats/chat-1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageType: 'flex',
          content: '[]',
        }),
      }),
      { DB: sendDb } as never,
    );

    expect(response.status).toBe(400);
    const json = (await response.json()) as { success: boolean; error?: string };
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/object/i);
  });
});
