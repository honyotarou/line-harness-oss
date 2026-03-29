import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getUsers: vi.fn(),
  getUserById: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  linkFriendToUser: vi.fn(),
  getUserFriends: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserByPhone: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

function createDb(friendExists = true) {
  return {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('SELECT id FROM friends WHERE id = ?')) {
                const [friendId] = bindings as [string];
                if (friendExists && friendId === 'friend-1') {
                  return { id: 'friend-1' } as T;
                }
                return null;
              }

              throw new Error(`Unexpected SQL: ${sql}`);
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe('users routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('rejects creating a user without a durable identifier', async () => {
    const { users } = await import('../../src/routes/users.js');
    const app = new Hono();
    app.route('/', users);

    const response = await app.fetch(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'No identifiers' }),
      }),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'at least one of email, phone, or externalId is required',
    });
  });

  it('returns 404 when linking a user to a missing friend', async () => {
    dbMocks.getUserById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      phone: null,
      external_id: null,
      display_name: 'User 1',
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });

    const { users } = await import('../../src/routes/users.js');
    const app = new Hono();
    app.route('/', users);

    const response = await app.fetch(
      new Request('http://localhost/api/users/user-1/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId: 'friend-404' }),
      }),
      { DB: createDb(false) } as never,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Friend not found',
    });
    expect(dbMocks.linkFriendToUser).not.toHaveBeenCalled();
  });

  it('rejects empty match criteria', async () => {
    const { users } = await import('../../src/routes/users.js');
    const app = new Hono();
    app.route('/', users);

    const response = await app.fetch(
      new Request('http://localhost/api/users/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'email or phone is required',
    });
  });
});
