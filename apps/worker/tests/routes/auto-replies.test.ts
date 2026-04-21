import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getAutoReplies: vi.fn(),
  getAutoReplyById: vi.fn(),
  createAutoReply: vi.fn(),
  updateAutoReply: vi.fn(),
  deleteAutoReply: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

describe('auto-replies routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/auto-replies returns serialized rows', async () => {
    const { autoReplies } = await import('../../src/routes/auto-replies.js');
    const app = new Hono();
    app.route('/', autoReplies);

    dbMocks.getAutoReplies.mockResolvedValue([
      {
        id: 'a1',
        keyword: 'hi',
        match_type: 'exact',
        response_type: 'text',
        response_content: 'Hello',
        line_account_id: null,
        is_active: 1,
        created_at: 't',
      },
    ]);

    const res = await app.fetch(new Request('http://w/api/auto-replies'), {
      DB: {} as D1Database,
    } as never);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { id: string; matchType: string; isActive: boolean }[];
    };
    expect(body.success).toBe(true);
    expect(body.data[0]?.matchType).toBe('exact');
    expect(body.data[0]?.isActive).toBe(true);
  });

  it('POST /api/auto-replies validates keyword and responseContent', async () => {
    const { autoReplies } = await import('../../src/routes/auto-replies.js');
    const app = new Hono();
    app.route('/', autoReplies);

    const res = await app.fetch(
      new Request('http://w/api/auto-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: ' ', responseContent: 'x' }),
      }),
      { DB: {} as D1Database } as never,
    );
    expect(res.status).toBe(400);
  });

  it('PUT /api/auto-replies/:id returns 404 when missing', async () => {
    const { autoReplies } = await import('../../src/routes/auto-replies.js');
    const app = new Hono();
    app.route('/', autoReplies);

    dbMocks.updateAutoReply.mockResolvedValue(null);

    const res = await app.fetch(
      new Request('http://w/api/auto-replies/nope', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      }),
      { DB: {} as D1Database } as never,
    );
    expect(res.status).toBe(404);
  });
});
