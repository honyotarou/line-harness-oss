import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getAccountHealthLogs: vi.fn(),
  getLatestRiskLevel: vi.fn(),
  getAccountMigrations: vi.fn(),
  getAccountMigrationById: vi.fn(),
  createAccountMigration: vi.fn(),
  updateAccountMigration: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

function createDb() {
  return {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('SELECT COUNT(*) as count FROM friends WHERE is_following = 1 AND line_account_id = ?')) {
                const [fromAccountId] = bindings as [string];
                if (fromAccountId !== 'account-1') {
                  throw new Error(`Unexpected account id: ${fromAccountId}`);
                }
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

describe('health routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('returns health logs and the latest risk level for the selected account', async () => {
    dbMocks.getLatestRiskLevel.mockResolvedValue('warning');
    dbMocks.getAccountHealthLogs.mockResolvedValue([
      {
        id: 'log-1',
        line_account_id: 'account-1',
        error_code: 429,
        error_count: 12,
        check_period: '1h',
        risk_level: 'warning',
        created_at: '2026-03-26T10:00:00+09:00',
      },
    ]);

    const { health } = await import('../../src/routes/health.js');
    const app = new Hono();
    app.route('/', health);

    const response = await app.fetch(
      new Request('http://localhost/api/accounts/account-1/health'),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        lineAccountId: 'account-1',
        riskLevel: 'warning',
        logs: [
          {
            id: 'log-1',
            errorCode: 429,
            errorCount: 12,
            checkPeriod: '1h',
            riskLevel: 'warning',
            createdAt: '2026-03-26T10:00:00+09:00',
          },
        ],
      },
    });
  });

  it('counts only friends on the source account when creating a migration', async () => {
    dbMocks.createAccountMigration.mockResolvedValue({
      id: 'migration-1',
      from_account_id: 'account-1',
      to_account_id: 'account-2',
      status: 'pending',
      migrated_count: 0,
      total_count: 3,
      created_at: '2026-03-26T10:00:00+09:00',
      completed_at: null,
    });
    dbMocks.updateAccountMigration.mockResolvedValue(undefined);

    const { health } = await import('../../src/routes/health.js');
    const app = new Hono();
    app.route('/', health);

    const response = await app.fetch(
      new Request('http://localhost/api/accounts/account-1/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toAccountId: 'account-2' }),
      }),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(201);
    expect(dbMocks.createAccountMigration).toHaveBeenCalledWith(
      expect.anything(),
      {
        fromAccountId: 'account-1',
        toAccountId: 'account-2',
        totalCount: 3,
      },
    );
    expect(dbMocks.updateAccountMigration).toHaveBeenCalledWith(
      expect.anything(),
      'migration-1',
      { status: 'in_progress' },
    );
  });
});
