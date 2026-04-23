import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getFriendById: vi.fn(),
  addTagToFriend: vi.fn().mockResolvedValue(undefined),
  removeTagFromFriend: vi.fn().mockResolvedValue(undefined),
  getScenarios: vi.fn().mockResolvedValue([]),
  enrollFriendInScenario: vi.fn().mockResolvedValue(undefined),
  jstNow: vi.fn(() => '2026-03-26T12:00:00+09:00'),
}));

vi.mock('@line-crm/db', () => dbMocks);

const eventBusMocks = vi.hoisted(() => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/event-bus.js', () => eventBusMocks);

const stubFriend = (lineAccountId: string | null) => ({
  id: 'friend-1',
  line_user_id: 'U1',
  display_name: 'Friend',
  metadata: '{}',
  line_account_id: lineAccountId,
  picture_url: null,
  status_message: null,
  is_following: 1,
  user_id: null,
  ref_code: null,
  created_at: '2026-03-26T12:00:00+09:00',
  updated_at: '2026-03-26T12:00:00+09:00',
});

/**
 * D1 stub that accepts every prepare/bind/run/first and returns empty results.
 * The friends.ts routes use db.prepare for the scenario-matching query; this
 * stub keeps that code path alive while we focus on the event-bus forwarding.
 */
function permissiveDb() {
  return {
    prepare: () => ({
      bind: () => ({
        run: async () => ({ meta: { changes: 0 } }),
        first: async () => null,
        all: async () => ({ results: [] }),
      }),
    }),
  } as unknown as D1Database;
}

describe('tag_change event bus forwarding (F1 cross-tenant guard)', () => {
  beforeEach(() => {
    for (const fn of Object.values(dbMocks)) {
      if ('mockClear' in fn) (fn as ReturnType<typeof vi.fn>).mockClear();
    }
    for (const fn of Object.values(eventBusMocks)) {
      fn.mockClear();
    }
  });

  it('POST /api/friends/:id/tags forwards friend.line_account_id to fireEvent', async () => {
    dbMocks.getFriendById.mockResolvedValue(stubFriend('acc-A'));

    const { friends } = await import('../../src/routes/friends.js');
    const app = new Hono();
    app.route('/', friends);

    const res = await app.fetch(
      new Request('http://localhost/api/friends/friend-1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId: 'tag-1' }),
      }),
      { DB: permissiveDb() } as never,
    );

    expect(res.status).toBe(201);
    expect(eventBusMocks.fireEvent).toHaveBeenCalledOnce();
    // Signature: fireEvent(db, eventType, payload, lineAccessToken, lineAccountId, options)
    const call = eventBusMocks.fireEvent.mock.calls[0]!;
    expect(call[1]).toBe('tag_change');
    expect(call[4]).toBe('acc-A');
  });

  it('DELETE /api/friends/:id/tags/:tagId forwards friend.line_account_id to fireEvent', async () => {
    dbMocks.getFriendById.mockResolvedValue(stubFriend('acc-B'));

    const { friends } = await import('../../src/routes/friends.js');
    const app = new Hono();
    app.route('/', friends);

    const res = await app.fetch(
      new Request('http://localhost/api/friends/friend-1/tags/tag-2', {
        method: 'DELETE',
      }),
      { DB: permissiveDb() } as never,
    );

    expect(res.status).toBe(200);
    expect(eventBusMocks.fireEvent).toHaveBeenCalledOnce();
    const call = eventBusMocks.fireEvent.mock.calls[0]!;
    expect(call[1]).toBe('tag_change');
    expect(call[4]).toBe('acc-B');
  });

  it('POST /api/friends/:id/tags forwards null when the friend is global (line_account_id=null)', async () => {
    dbMocks.getFriendById.mockResolvedValue(stubFriend(null));

    const { friends } = await import('../../src/routes/friends.js');
    const app = new Hono();
    app.route('/', friends);

    const res = await app.fetch(
      new Request('http://localhost/api/friends/friend-1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId: 'tag-1' }),
      }),
      { DB: permissiveDb() } as never,
    );

    expect(res.status).toBe(201);
    expect(eventBusMocks.fireEvent).toHaveBeenCalledOnce();
    const call = eventBusMocks.fireEvent.mock.calls[0]!;
    // null (not undefined): we have tenant context, the friend is explicitly global
    expect(call[4]).toBe(null);
  });
});
