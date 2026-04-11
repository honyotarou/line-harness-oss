import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getAutomations: vi.fn(),
  getAutomationById: vi.fn(),
  createAutomation: vi.fn(),
  updateAutomation: vi.fn(),
  deleteAutomation: vi.fn(),
  getAutomationLogs: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

function createDb() {
  return {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async all<T>() {
              if (sql.includes('FROM automations WHERE line_account_id = ?')) {
                const [lineAccountId] = bindings as [string];
                return {
                  results: [
                    {
                      id: 'automation-1',
                      name: 'Scoped automation',
                      description: 'account scoped',
                      event_type: 'friend_add',
                      conditions: '{"tag":"vip"}',
                      actions: '[{"type":"add_tag","params":{"tagId":"tag-1"}}]',
                      line_account_id: lineAccountId,
                      is_active: 1,
                      priority: 10,
                      created_at: '2026-03-25T10:00:00+09:00',
                      updated_at: '2026-03-25T11:00:00+09:00',
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

describe('automations routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('filters automations by LINE account and exposes lineAccountId in list responses', async () => {
    const { automations } = await import('../../src/routes/automations.js');
    const app = new Hono();
    app.route('/', automations);

    const response = await app.fetch(
      new Request('http://localhost/api/automations?lineAccountId=account-1'),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'automation-1',
          name: 'Scoped automation',
          description: 'account scoped',
          eventType: 'friend_add',
          conditions: { tag: 'vip' },
          actions: [{ type: 'add_tag', params: { tagId: 'tag-1' } }],
          isActive: true,
          priority: 10,
          lineAccountId: 'account-1',
          createdAt: '2026-03-25T10:00:00+09:00',
          updatedAt: '2026-03-25T11:00:00+09:00',
        },
      ],
    });
  });

  it('returns lineAccountId when creating an automation', async () => {
    dbMocks.createAutomation.mockResolvedValue({
      id: 'automation-1',
      name: 'Scoped automation',
      description: 'account scoped',
      event_type: 'friend_add',
      conditions: '{}',
      actions: '[]',
      line_account_id: null,
      is_active: 1,
      priority: 5,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });

    const { automations } = await import('../../src/routes/automations.js');
    const app = new Hono();
    app.route('/', automations);

    const response = await app.fetch(
      new Request('http://localhost/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Scoped automation',
          eventType: 'friend_add',
          actions: [],
          priority: 5,
          lineAccountId: 'account-1',
        }),
      }),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(201);
    expect(dbMocks.createAutomation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lineAccountId: 'account-1',
      }),
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'automation-1',
        name: 'Scoped automation',
        eventType: 'friend_add',
        actions: [],
        isActive: true,
        priority: 5,
        lineAccountId: 'account-1',
        createdAt: '2026-03-25T10:00:00+09:00',
      },
    });
  });

  it('returns empty conditions and actions when stored automation JSON is corrupt', async () => {
    const corruptDb = {
      prepare(sql: string) {
        return {
          bind(...bindings: unknown[]) {
            return {
              async all<T>() {
                if (sql.includes('FROM automations WHERE line_account_id = ?')) {
                  const [lineAccountId] = bindings as [string];
                  return {
                    results: [
                      {
                        id: 'automation-bad',
                        name: 'Bad JSON',
                        description: null,
                        event_type: 'friend_add',
                        conditions: '{bad',
                        actions: 'not-array',
                        line_account_id: lineAccountId,
                        is_active: 1,
                        priority: 1,
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

    const { automations } = await import('../../src/routes/automations.js');
    const app = new Hono();
    app.route('/', automations);

    const response = await app.fetch(
      new Request('http://localhost/api/automations?lineAccountId=account-1'),
      { DB: corruptDb } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'automation-bad',
          name: 'Bad JSON',
          description: null,
          eventType: 'friend_add',
          conditions: {},
          actions: [],
          isActive: true,
          priority: 1,
          lineAccountId: 'account-1',
          createdAt: '2026-03-25T10:00:00+09:00',
          updatedAt: '2026-03-25T10:00:00+09:00',
        },
      ],
    });
  });

  it('GET /api/automations/:id tolerates corrupt log eventData and actionsResult', async () => {
    dbMocks.getAutomationById.mockResolvedValue({
      id: 'a1',
      name: 'Rule',
      description: null,
      event_type: 'friend_add',
      conditions: '{bad',
      actions: 'not-array',
      line_account_id: 'acc-1',
      is_active: 1,
      priority: 0,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });
    dbMocks.getAutomationLogs.mockResolvedValue([
      {
        id: 'log-1',
        automation_id: 'a1',
        friend_id: 'f1',
        event_data: '{bad',
        actions_result: 'also-bad',
        status: 'failed',
        created_at: '2026-03-25T11:00:00+09:00',
      },
    ]);

    const { automations } = await import('../../src/routes/automations.js');
    const app = new Hono();
    app.route('/', automations);

    const response = await app.fetch(new Request('http://localhost/api/automations/a1'), {
      DB: {} as D1Database,
    } as never);

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      success: boolean;
      data: {
        conditions: unknown;
        actions: unknown;
        logs: Array<{ eventData: unknown; actionsResult: unknown }>;
      };
    };
    expect(json.data.conditions).toEqual({});
    expect(json.data.actions).toEqual([]);
    expect(json.data.logs[0].eventData).toBeNull();
    expect(json.data.logs[0].actionsResult).toBeNull();
  });

  it('rejects create when send_webhook points at a non-public URL', async () => {
    const { automations } = await import('../../src/routes/automations.js');
    const app = new Hono();
    app.route('/', automations);

    const response = await app.fetch(
      new Request('http://localhost/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bad hook',
          eventType: 'friend_add',
          actions: [{ type: 'send_webhook', params: { url: 'https://127.0.0.1/x' } }],
        }),
      }),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(400);
    expect(dbMocks.createAutomation).not.toHaveBeenCalled();
  });
});
