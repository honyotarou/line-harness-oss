import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRequestRateLimits } from '../../src/services/request-rate-limit.js';

const dbMocks = vi.hoisted(() => ({
  getBroadcastById: vi.fn(),
  claimBroadcastForSending: vi.fn(),
}));

vi.mock('@line-crm/db', () => ({
  getBroadcastById: dbMocks.getBroadcastById,
  claimBroadcastForSending: dbMocks.claimBroadcastForSending,
}));

vi.mock('../../src/services/broadcast.js', () => ({
  processBroadcastSend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/line-account-routing.js', () => ({
  resolveLineAccessTokenForLineAccountId: vi.fn().mockResolvedValue('token'),
}));

vi.mock('@line-crm/line-sdk', () => ({
  createLineClient: vi.fn().mockImplementation(() => ({})),
}));

const fullBroadcastRow = {
  id: 'broadcast-1',
  title: 'Title',
  message_type: 'text' as const,
  message_content: 'hello',
  target_type: 'all' as const,
  target_tag_id: null,
  line_account_id: 'account-2',
  scheduled_at: null,
  sent_at: null,
  total_count: 0,
  success_count: 0,
  created_at: '2026-03-25T10:00:00+09:00',
};

describe('broadcast send rate limit', () => {
  beforeEach(() => {
    resetRequestRateLimits();
    vi.resetModules();
    dbMocks.getBroadcastById.mockReset();
    dbMocks.claimBroadcastForSending.mockReset();
    dbMocks.claimBroadcastForSending.mockResolvedValue(true);
    let getCalls = 0;
    dbMocks.getBroadcastById.mockImplementation(async () => {
      getCalls += 1;
      if (getCalls % 2 === 1) {
        return { ...fullBroadcastRow, status: 'draft' as const };
      }
      return { ...fullBroadcastRow, status: 'sent' as const };
    });
  });

  it('returns 429 after exceeding per-minute mass-send budget for the same Bearer', async () => {
    const { broadcasts } = await import('../../src/routes/broadcasts.js');
    const app = new Hono();
    app.route('/', broadcasts);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer same-session-token',
    } as Record<string, string>;

    for (let i = 0; i < 3; i++) {
      const res = await app.fetch(
        new Request('http://localhost/api/broadcasts/broadcast-1/send', {
          method: 'POST',
          headers,
          body: JSON.stringify({ confirm: true }),
        }),
        {
          DB: {} as D1Database,
          LINE_CHANNEL_ACCESS_TOKEN: 'default-token',
        } as never,
      );
      expect(res.status).toBe(200);
    }

    const blocked = await app.fetch(
      new Request('http://localhost/api/broadcasts/broadcast-1/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({ confirm: true }),
      }),
      {
        DB: {} as D1Database,
        LINE_CHANNEL_ACCESS_TOKEN: 'default-token',
      } as never,
    );
    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toEqual(
      expect.objectContaining({ success: false, error: 'Too many requests' }),
    );
  });
});
