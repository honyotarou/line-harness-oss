import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scopeMocks = vi.hoisted(() => ({
  listPrincipalLineAccountIdsForEmail: vi.fn(),
  getTagsForFriends: vi.fn(),
  getFriendById: vi.fn(),
  getFriendTags: vi.fn(),
}));

vi.mock('@line-crm/db', async (importOriginal) => {
  const o = await importOriginal<typeof import('@line-crm/db')>();
  return {
    ...o,
    listPrincipalLineAccountIdsForEmail: scopeMocks.listPrincipalLineAccountIdsForEmail,
    getTagsForFriends: scopeMocks.getTagsForFriends,
    getFriendById: scopeMocks.getFriendById,
    getFriendTags: scopeMocks.getFriendTags,
  };
});

function createListDb() {
  return {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async all<T>() {
              if (sql.includes('SELECT f.* FROM friends f')) {
                return { results: [] as T[] };
              }
              throw new Error(`Unexpected SQL: ${sql}`);
            },
            async first<T>() {
              if (sql.includes('SELECT COUNT(*) as count FROM friends f')) {
                return { count: 0 } as T;
              }
              throw new Error(`Unexpected SQL: ${sql}`);
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

const cfEnv = {
  DB: {} as D1Database,
  API_KEY: 'k',
  REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
} as const;

describe('friends routes — LINE account scope (IDOR)', () => {
  beforeEach(() => {
    scopeMocks.listPrincipalLineAccountIdsForEmail.mockReset();
    scopeMocks.getTagsForFriends.mockReset();
    scopeMocks.getFriendById.mockReset();
    scopeMocks.getFriendTags.mockReset();
    scopeMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue(['allowed-account']);
    scopeMocks.getTagsForFriends.mockResolvedValue(new Map());
  });

  it('returns 400 when a scoped principal omits lineAccountId on GET /api/friends', async () => {
    const { friends } = await import('../../src/routes/friends.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', friends);

    const response = await app.fetch(
      new Request('http://localhost/api/friends?limit=10&offset=0'),
      { ...cfEnv, DB: createListDb() } as never,
    );

    expect(response.status).toBe(400);
    const j = (await response.json()) as { error?: string };
    expect(j.error).toMatch(/lineAccountId/i);
  });

  it('returns 403 when a scoped principal requests a disallowed lineAccountId', async () => {
    const { friends } = await import('../../src/routes/friends.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', friends);

    const response = await app.fetch(
      new Request('http://localhost/api/friends?lineAccountId=other&limit=10&offset=0'),
      { ...cfEnv, DB: createListDb() } as never,
    );

    expect(response.status).toBe(403);
  });

  it('returns 404 for GET /api/friends/:id when friend line account is outside scope', async () => {
    scopeMocks.getFriendById.mockResolvedValue({
      id: 'f1',
      line_user_id: 'U1',
      display_name: 'X',
      picture_url: null,
      status_message: null,
      is_following: 1,
      line_account_id: 'other-account',
      metadata: '{}',
      ref_code: null,
      user_id: null,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });
    scopeMocks.getFriendTags.mockResolvedValue([]);

    const { friends } = await import('../../src/routes/friends.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', friends);

    const response = await app.fetch(new Request('http://localhost/api/friends/f1'), {
      ...cfEnv,
      DB: {} as D1Database,
    } as never);

    expect(response.status).toBe(404);
  });
});
