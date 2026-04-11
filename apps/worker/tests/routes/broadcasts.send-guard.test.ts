import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getBroadcastById: vi.fn(),
  processBroadcastSend: vi.fn(),
}));

vi.mock('@line-crm/db', () => ({
  getBroadcastById: dbMocks.getBroadcastById,
}));

vi.mock('../../src/services/broadcast.js', () => ({
  processBroadcastSend: dbMocks.processBroadcastSend,
}));

vi.mock('../../src/services/line-account-routing.js', () => ({
  resolveLineAccessTokenForLineAccountId: vi.fn().mockResolvedValue('token'),
}));

vi.mock('@line-crm/line-sdk', () => ({
  LineClient: vi.fn().mockImplementation(() => ({})),
}));

describe('broadcast send guard', () => {
  beforeEach(() => {
    vi.resetModules();
    dbMocks.getBroadcastById.mockReset();
    dbMocks.processBroadcastSend.mockReset();
  });

  it('returns 403 when BROADCAST_SEND_SECRET is set but header is missing', async () => {
    dbMocks.getBroadcastById.mockResolvedValue({
      id: 'b1',
      title: 't',
      message_type: 'text',
      message_content: 'm',
      target_type: 'all',
      target_tag_id: null,
      line_account_id: 'acc-1',
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

    const res = await app.fetch(
      new Request('http://localhost/api/broadcasts/b1/send', { method: 'POST' }),
      {
        DB: {} as D1Database,
        LINE_CHANNEL_ACCESS_TOKEN: 't',
        BROADCAST_SEND_SECRET: 'super-secret-send-key',
      } as never,
    );

    expect(res.status).toBe(403);
    expect(dbMocks.processBroadcastSend).not.toHaveBeenCalled();
  });

  it('allows send when X-Broadcast-Send-Secret matches', async () => {
    dbMocks.getBroadcastById
      .mockResolvedValueOnce({
        id: 'b1',
        title: 't',
        message_type: 'text',
        message_content: 'm',
        target_type: 'all',
        target_tag_id: null,
        line_account_id: 'acc-1',
        status: 'draft',
        scheduled_at: null,
        sent_at: null,
        total_count: 0,
        success_count: 0,
        created_at: '2026-03-25T10:00:00+09:00',
      })
      .mockResolvedValueOnce({
        id: 'b1',
        title: 't',
        message_type: 'text',
        message_content: 'm',
        target_type: 'all',
        target_tag_id: null,
        line_account_id: 'acc-1',
        status: 'sent',
        scheduled_at: null,
        sent_at: '2026-03-25T11:00:00+09:00',
        total_count: 1,
        success_count: 1,
        created_at: '2026-03-25T10:00:00+09:00',
      });

    dbMocks.processBroadcastSend.mockResolvedValue(undefined);

    const { broadcasts } = await import('../../src/routes/broadcasts.js');
    const app = new Hono();
    app.route('/', broadcasts);

    const res = await app.fetch(
      new Request('http://localhost/api/broadcasts/b1/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Broadcast-Send-Secret': 'super-secret-send-key',
        },
        body: JSON.stringify({ confirm: true }),
      }),
      {
        DB: {} as D1Database,
        LINE_CHANNEL_ACCESS_TOKEN: 't',
        BROADCAST_SEND_SECRET: 'super-secret-send-key',
      } as never,
    );

    expect(res.status).toBe(200);
    expect(dbMocks.processBroadcastSend).toHaveBeenCalled();
  });
});
