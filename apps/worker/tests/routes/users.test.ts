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
  getFriendById: vi.fn(),
  listPrincipalLineAccountIdsForEmail: vi.fn(),
}));

vi.mock('@line-crm/db', async (importOriginal) => {
  const o = await importOriginal<typeof import('@line-crm/db')>();
  return { ...o, ...dbMocks };
});

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

  it('returns 404 on cross-tenant POST /api/users/:id/link (restricted scope does not link)', async () => {
    // F4: restricted admin (acc-A only) attempts to link a friend that belongs to acc-B.
    // The route must return 404 (no existence oracle) and linkFriendToUser must NOT run.
    dbMocks.getUserById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      phone: null,
      external_id: null,
      display_name: 'User 1',
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-B',
      line_user_id: 'U-B',
      display_name: 'F B',
      line_account_id: 'acc-B',
      metadata: '{}',
      picture_url: null,
      status_message: null,
      is_following: 1,
      user_id: null,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue(['acc-A']);

    const { users } = await import('../../src/routes/users.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', users);

    const response = await app.fetch(
      new Request('http://localhost/api/users/user-1/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId: 'friend-B' }),
      }),
      {
        DB: {} as D1Database,
        API_KEY: 'k',
        REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      } as never,
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
