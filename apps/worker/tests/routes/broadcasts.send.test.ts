import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getBroadcasts: vi.fn(),
  getBroadcastById: vi.fn(),
  createBroadcast: vi.fn(),
  updateBroadcast: vi.fn(),
  deleteBroadcast: vi.fn(),
  getLineAccountById: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

const serviceMocks = vi.hoisted(() => ({
  processBroadcastSend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/broadcast.js', () => serviceMocks);

const lineSdkMocks = vi.hoisted(() => ({
  lineClientCtor: vi.fn(),
}));

vi.mock('@line-crm/line-sdk', () => ({
  LineClient: vi.fn().mockImplementation((token: string) => {
    lineSdkMocks.lineClientCtor(token);
    return { token };
  }),
}));

describe('broadcast send route', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    serviceMocks.processBroadcastSend.mockClear();
    lineSdkMocks.lineClientCtor.mockClear();
  });

  it('uses the broadcast account token when sending immediately', async () => {
    dbMocks.getBroadcastById
      .mockResolvedValueOnce({
        id: 'broadcast-1',
        status: 'draft',
        line_account_id: 'account-2',
      })
      .mockResolvedValueOnce({
        id: 'broadcast-1',
        status: 'sent',
        line_account_id: 'account-2',
        title: 'Title',
        message_type: 'text',
        message_content: 'hello',
        target_type: 'all',
        target_tag_id: null,
        scheduled_at: null,
        sent_at: null,
        total_count: 0,
        success_count: 0,
        created_at: '2026-03-25T10:00:00+09:00',
      });
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'account-2',
      channel_access_token: 'account-2-token',
    });

    const { broadcasts } = await import('../../src/routes/broadcasts.js');
    const app = new Hono();
    app.route('/', broadcasts);

    const response = await app.fetch(
      new Request('http://localhost/api/broadcasts/broadcast-1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      }),
      {
        DB: {} as D1Database,
        LINE_CHANNEL_ACCESS_TOKEN: 'default-token',
      } as never,
    );

    expect(response.status).toBe(200);
    expect(lineSdkMocks.lineClientCtor).toHaveBeenCalledWith('account-2-token');
    expect(serviceMocks.processBroadcastSend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ token: 'account-2-token' }),
      'broadcast-1',
    );
  });

  it('returns a failure response when delivery falls back to a retryable draft', async () => {
    dbMocks.getBroadcastById
      .mockResolvedValueOnce({
        id: 'broadcast-1',
        status: 'draft',
        line_account_id: 'account-2',
      })
      .mockResolvedValueOnce({
        id: 'broadcast-1',
        status: 'draft',
        line_account_id: 'account-2',
        title: 'Title',
        message_type: 'text',
        message_content: 'hello',
        target_type: 'all',
        target_tag_id: null,
        scheduled_at: null,
        sent_at: null,
        total_count: 2,
        success_count: 1,
        created_at: '2026-03-25T10:00:00+09:00',
      });
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'account-2',
      channel_access_token: 'account-2-token',
    });

    const { broadcasts } = await import('../../src/routes/broadcasts.js');
    const app = new Hono();
    app.route('/', broadcasts);

    const response = await app.fetch(
      new Request('http://localhost/api/broadcasts/broadcast-1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      }),
      {
        DB: {} as D1Database,
        LINE_CHANNEL_ACCESS_TOKEN: 'default-token',
      } as never,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Broadcast delivery failed',
      data: expect.objectContaining({
        id: 'broadcast-1',
        status: 'draft',
        totalCount: 2,
        successCount: 1,
      }),
    });
  });
});
