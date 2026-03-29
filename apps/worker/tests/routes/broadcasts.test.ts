import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getBroadcasts: vi.fn(),
  getBroadcastById: vi.fn(),
  createBroadcast: vi.fn(),
  updateBroadcast: vi.fn(),
  deleteBroadcast: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

vi.mock('../../src/services/broadcast.js', () => ({
  processBroadcastSend: vi.fn(),
}));

vi.mock('../../src/services/segment-send.js', () => ({
  processSegmentSend: vi.fn(),
}));

vi.mock('../../src/services/line-account-routing.js', () => ({
  resolveLineAccessTokenForLineAccountId: vi.fn(),
}));

function createDb() {
  return {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async all<T>() {
              if (sql.includes('FROM broadcasts WHERE line_account_id = ?')) {
                const [lineAccountId] = bindings as [string];
                return {
                  results: [
                    {
                      id: 'broadcast-1',
                      title: 'Scoped broadcast',
                      message_type: 'text',
                      message_content: 'hello',
                      target_type: 'all',
                      target_tag_id: null,
                      line_account_id: lineAccountId,
                      status: 'draft',
                      scheduled_at: null,
                      sent_at: null,
                      total_count: 0,
                      success_count: 0,
                      created_at: '2026-03-25T10:00:00+09:00',
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

describe('broadcasts routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('filters broadcasts by LINE account and returns lineAccountId', async () => {
    const { broadcasts } = await import('../../src/routes/broadcasts.js');
    const app = new Hono();
    app.route('/', broadcasts);

    const response = await app.fetch(
      new Request('http://localhost/api/broadcasts?lineAccountId=account-1'),
      { DB: createDb(), LINE_CHANNEL_ACCESS_TOKEN: 'default-token' } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'broadcast-1',
          title: 'Scoped broadcast',
          messageType: 'text',
          messageContent: 'hello',
          targetType: 'all',
          targetTagId: null,
          status: 'draft',
          lineAccountId: 'account-1',
          scheduledAt: null,
          sentAt: null,
          totalCount: 0,
          successCount: 0,
          createdAt: '2026-03-25T10:00:00+09:00',
        },
      ],
    });
  });

  it('returns lineAccountId when creating a broadcast', async () => {
    dbMocks.createBroadcast.mockResolvedValue({
      id: 'broadcast-1',
      title: 'Scoped broadcast',
      message_type: 'text',
      message_content: 'hello',
      target_type: 'all',
      target_tag_id: null,
      line_account_id: null,
      status: 'draft',
      scheduled_at: null,
      sent_at: null,
      total_count: 0,
      success_count: 0,
      created_at: '2026-03-25T10:00:00+09:00',
    });

    const { broadcasts } = await import('../../src/routes/broadcasts.js');
    const app = new Hono();
    app.route('/', broadcasts);

    const response = await app.fetch(
      new Request('http://localhost/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Scoped broadcast',
          messageType: 'text',
          messageContent: 'hello',
          targetType: 'all',
          lineAccountId: 'account-1',
        }),
      }),
      { DB: createDb(), LINE_CHANNEL_ACCESS_TOKEN: 'default-token' } as never,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'broadcast-1',
        title: 'Scoped broadcast',
        messageType: 'text',
        messageContent: 'hello',
        targetType: 'all',
        targetTagId: null,
        status: 'draft',
        lineAccountId: 'account-1',
        scheduledAt: null,
        sentAt: null,
        totalCount: 0,
        successCount: 0,
        createdAt: '2026-03-25T10:00:00+09:00',
      },
    });
  });
});
