import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getNotificationRules: vi.fn(),
  getNotificationRuleById: vi.fn(),
  createNotificationRule: vi.fn(),
  updateNotificationRule: vi.fn().mockResolvedValue(undefined),
  deleteNotificationRule: vi.fn().mockResolvedValue(undefined),
  getNotifications: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

function createDb() {
  return {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async all<T>() {
              if (sql.includes('FROM notification_rules WHERE line_account_id = ?')) {
                const [lineAccountId] = bindings as [string];
                return {
                  results: [
                    {
                      id: 'rule-1',
                      name: 'Delivery failures',
                      event_type: 'delivery_failure',
                      conditions: '{"attempts":3}',
                      channels: '["dashboard"]',
                      line_account_id: lineAccountId,
                      is_active: 1,
                      created_at: '2026-03-25T10:00:00+09:00',
                      updated_at: '2026-03-25T10:00:00+09:00',
                    },
                  ] as T[],
                };
              }

              if (sql.includes('FROM notifications WHERE line_account_id = ? AND status = ?')) {
                const [lineAccountId, status] = bindings as [string, string, number];
                return {
                  results: [
                    {
                      id: 'notification-1',
                      rule_id: 'rule-1',
                      event_type: 'delivery_failure',
                      title: 'Delivery failed',
                      body: 'push failed',
                      channel: 'dashboard',
                      status,
                      line_account_id: lineAccountId,
                      metadata: '{"attempts":3}',
                      created_at: '2026-03-25T10:00:00+09:00',
                    },
                  ] as T[],
                };
              }

              throw new Error(`Unexpected SQL: ${sql}`);
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe('notifications routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.updateNotificationRule.mockResolvedValue(undefined);
    dbMocks.deleteNotificationRule.mockResolvedValue(undefined);
  });

  it('creates notification rules scoped to a LINE account', async () => {
    dbMocks.createNotificationRule.mockResolvedValue({
      id: 'rule-1',
      name: 'Delivery failures',
      event_type: 'delivery_failure',
      conditions: '{"attempts":3}',
      channels: '["dashboard"]',
      line_account_id: 'account-1',
      is_active: 1,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });

    const { notifications } = await import('../../src/routes/notifications.js');
    const app = new Hono();
    app.route('/', notifications);

    const response = await app.fetch(
      new Request('http://localhost/api/notifications/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Delivery failures',
          eventType: 'delivery_failure',
          channels: ['dashboard'],
          lineAccountId: 'account-1',
        }),
      }),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(201);
    expect(dbMocks.createNotificationRule).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lineAccountId: 'account-1',
      }),
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'rule-1',
        name: 'Delivery failures',
        eventType: 'delivery_failure',
        channels: ['dashboard'],
        lineAccountId: 'account-1',
        createdAt: '2026-03-25T10:00:00+09:00',
      },
    });
  });

  it('filters notification rules by line account and exposes the scope in responses', async () => {
    const { notifications } = await import('../../src/routes/notifications.js');
    const app = new Hono();
    app.route('/', notifications);

    const response = await app.fetch(
      new Request('http://localhost/api/notifications/rules?lineAccountId=account-1'),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'rule-1',
          name: 'Delivery failures',
          eventType: 'delivery_failure',
          conditions: { attempts: 3 },
          channels: ['dashboard'],
          lineAccountId: 'account-1',
          isActive: true,
          createdAt: '2026-03-25T10:00:00+09:00',
          updatedAt: '2026-03-25T10:00:00+09:00',
        },
      ],
    });
  });

  it('filters notifications by line account and status', async () => {
    const { notifications } = await import('../../src/routes/notifications.js');
    const app = new Hono();
    app.route('/', notifications);

    const response = await app.fetch(
      new Request('http://localhost/api/notifications?lineAccountId=account-1&status=failed&limit=10'),
      { DB: createDb() } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'notification-1',
          ruleId: 'rule-1',
          eventType: 'delivery_failure',
          title: 'Delivery failed',
          body: 'push failed',
          channel: 'dashboard',
          status: 'failed',
          lineAccountId: 'account-1',
          metadata: { attempts: 3 },
          createdAt: '2026-03-25T10:00:00+09:00',
        },
      ],
    });
  });
});
