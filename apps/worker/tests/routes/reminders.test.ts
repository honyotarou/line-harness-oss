import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getReminders: vi.fn(),
  getReminderById: vi.fn(),
  createReminder: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
  getReminderSteps: vi.fn(),
  createReminderStep: vi.fn(),
  deleteReminderStep: vi.fn(),
  enrollFriendInReminder: vi.fn(),
  getFriendReminders: vi.fn(),
  cancelFriendReminder: vi.fn(),
  getFriendById: vi.fn(),
  listPrincipalLineAccountIdsForEmail: vi.fn(),
  getLineAccounts: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

function createDb() {
  return {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async all<T>() {
              if (sql.includes('FROM reminders WHERE line_account_id = ?')) {
                const [lineAccountId] = bindings as [string];
                return {
                  results: [
                    {
                      id: 'reminder-1',
                      name: 'Scoped reminder',
                      description: 'account scoped',
                      line_account_id: lineAccountId,
                      is_active: 1,
                      created_at: '2026-03-25T10:00:00+09:00',
                      updated_at: '2026-03-25T10:00:00+09:00',
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
      };
    },
  } as unknown as D1Database;
}

const cfEnv = {
  DB: {} as D1Database,
  REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
} as const;

describe('reminders routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue([]);
    dbMocks.getLineAccounts.mockResolvedValue([]);
  });

  it('filters reminders by LINE account and returns lineAccountId', async () => {
    const { reminders } = await import('../../src/routes/reminders.js');
    const app = new Hono();
    app.route('/', reminders);

    const response = await app.fetch(
      new Request('http://localhost/api/reminders?lineAccountId=account-1'),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'reminder-1',
          name: 'Scoped reminder',
          description: 'account scoped',
          isActive: true,
          lineAccountId: 'account-1',
          createdAt: '2026-03-25T10:00:00+09:00',
          updatedAt: '2026-03-25T10:00:00+09:00',
        },
      ],
    });
  });

  it('returns lineAccountId when creating a reminder', async () => {
    dbMocks.createReminder.mockResolvedValue({
      id: 'reminder-1',
      name: 'Scoped reminder',
      description: 'account scoped',
      line_account_id: 'account-1',
      is_active: 1,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });

    const { reminders } = await import('../../src/routes/reminders.js');
    const app = new Hono();
    app.route('/', reminders);

    const response = await app.fetch(
      new Request('http://localhost/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Scoped reminder',
          description: 'account scoped',
          lineAccountId: 'account-1',
        }),
      }),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'reminder-1',
        name: 'Scoped reminder',
        lineAccountId: 'account-1',
        createdAt: '2026-03-25T10:00:00+09:00',
      },
    });
    expect(dbMocks.createReminder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Scoped reminder',
        lineAccountId: 'account-1',
      }),
    );
  });

  it('returns 400 when a scoped principal omits lineAccountId on GET /api/reminders', async () => {
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue(['allowed-account']);

    const { reminders } = await import('../../src/routes/reminders.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', reminders);

    const response = await app.fetch(new Request('http://localhost/api/reminders'), {
      ...cfEnv,
      DB: createDb(),
    } as never);

    expect(response.status).toBe(400);
    const j = (await response.json()) as { error?: string };
    expect(j.error).toMatch(/lineAccountId/i);
  });

  it('returns 404 for GET /api/reminders/:id when reminder line account is outside scope', async () => {
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue(['allowed-account']);
    dbMocks.getReminderById.mockResolvedValue({
      id: 'r-out',
      name: 'Other',
      description: null,
      is_active: 1,
      line_account_id: 'other-account',
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });
    dbMocks.getReminderSteps.mockResolvedValue([]);

    const { reminders } = await import('../../src/routes/reminders.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', reminders);

    const response = await app.fetch(new Request('http://localhost/api/reminders/r-out'), {
      ...cfEnv,
      DB: createDb(),
    } as never);

    expect(response.status).toBe(404);
  });
});
