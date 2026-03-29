import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getScenarios: vi.fn(),
  getScenarioById: vi.fn(),
  createScenario: vi.fn(),
  updateScenario: vi.fn(),
  deleteScenario: vi.fn(),
  createScenarioStep: vi.fn(),
  updateScenarioStep: vi.fn(),
  deleteScenarioStep: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  getFriendById: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

function createDb() {
  return {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async all<T>() {
              if (sql.includes('FROM scenarios s')) {
                const [lineAccountId] = bindings as [string];
                return {
                  results: [
                    {
                      id: 'scenario-1',
                      name: 'Scoped scenario',
                      description: 'account scoped',
                      trigger_type: 'friend_add',
                      trigger_tag_id: null,
                      line_account_id: lineAccountId,
                      is_active: 1,
                      created_at: '2026-03-25T10:00:00+09:00',
                      updated_at: '2026-03-25T10:00:00+09:00',
                      step_count: 2,
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

describe('scenarios routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('filters scenarios by LINE account and returns lineAccountId', async () => {
    const { scenarios } = await import('../../src/routes/scenarios.js');
    const app = new Hono();
    app.route('/', scenarios);

    const response = await app.fetch(
      new Request('http://localhost/api/scenarios?lineAccountId=account-1'),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'scenario-1',
          name: 'Scoped scenario',
          description: 'account scoped',
          triggerType: 'friend_add',
          triggerTagId: null,
          isActive: true,
          lineAccountId: 'account-1',
          createdAt: '2026-03-25T10:00:00+09:00',
          updatedAt: '2026-03-25T10:00:00+09:00',
          stepCount: 2,
        },
      ],
    });
  });

  it('returns lineAccountId when creating a scenario', async () => {
    dbMocks.createScenario.mockResolvedValue({
      id: 'scenario-1',
      name: 'Scoped scenario',
      description: null,
      trigger_type: 'friend_add',
      trigger_tag_id: null,
      line_account_id: null,
      is_active: 1,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });

    const { scenarios } = await import('../../src/routes/scenarios.js');
    const app = new Hono();
    app.route('/', scenarios);

    const response = await app.fetch(
      new Request('http://localhost/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Scoped scenario',
          triggerType: 'friend_add',
          lineAccountId: 'account-1',
        }),
      }),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'scenario-1',
        name: 'Scoped scenario',
        description: null,
        triggerType: 'friend_add',
        triggerTagId: null,
        isActive: true,
        lineAccountId: 'account-1',
        createdAt: '2026-03-25T10:00:00+09:00',
        updatedAt: '2026-03-25T10:00:00+09:00',
      },
    });
  });
});
