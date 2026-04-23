import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getCalendarConnections: vi.fn(),
  getCalendarConnectionById: vi.fn(),
  createCalendarConnection: vi.fn(),
  deleteCalendarConnection: vi.fn(),
  getCalendarBookings: vi.fn(),
  getCalendarBookingById: vi.fn(),
  createCalendarBooking: vi.fn(),
  updateCalendarBookingStatus: vi.fn(),
  updateCalendarBookingEventId: vi.fn(),
  getBookingsInRange: vi.fn(),
  toJstString: vi.fn(),
  getFriendById: vi.fn(),
  getUserFriends: vi.fn(),
  listPrincipalLineAccountIdsForEmail: vi.fn(),
}));

vi.mock('@line-crm/db', async (importOriginal) => {
  const o = await importOriginal<typeof import('@line-crm/db')>();
  return { ...o, ...dbMocks };
});

const connRow = (id: string, lineAccountId: string | null) =>
  ({
    id,
    calendar_id: `${id}@example.com`,
    access_token: null,
    refresh_token: null,
    api_key: null,
    auth_type: 'api_key',
    is_active: 1,
    line_account_id: lineAccountId,
    created_at: 't',
    updated_at: 't',
  }) as const;

const scopedEnv = {
  DB: {} as D1Database,
  API_KEY: 'k',
  REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
} as const;

function scopedCalendarApp(mod: typeof import('../../src/routes/calendar.js')) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
    await next();
  });
  app.route('/', mod.calendar);
  return app;
}

vi.mock('../../src/services/google-calendar.js', () => ({
  createGoogleCalendarClient: vi.fn(() => ({
    createEvent: vi.fn(),
    deleteEvent: vi.fn(),
    getFreeBusy: vi.fn(),
  })),
}));

describe('calendar booking route', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('resolves a UUID-like friendId to the actual friend record before inserting the booking', async () => {
    dbMocks.getFriendById.mockResolvedValue(null);
    dbMocks.getUserFriends.mockResolvedValue([
      { id: 'friend-1', is_following: 0 },
      { id: 'friend-2', is_following: 1 },
    ]);
    dbMocks.createCalendarBooking.mockImplementation(
      async (_db: D1Database, input: Record<string, unknown>) => ({
        id: 'booking-1',
        connection_id: input.connectionId,
        friend_id: input.friendId,
        event_id: null,
        title: input.title,
        start_at: input.startAt,
        end_at: input.endAt,
        status: 'confirmed',
        created_at: '2026-03-25T10:00:00+09:00',
      }),
    );
    // F3: /book now requires the connection to exist and be visible to the caller.
    // Default (scope.mode='all') accepts any connection regardless of line_account_id.
    dbMocks.getCalendarConnectionById.mockResolvedValue(connRow('conn-1', null));

    const { calendar } = await import('../../src/routes/calendar.js');
    const app = new Hono();
    app.route('/', calendar);

    const response = await app.fetch(
      new Request('http://localhost/api/integrations/google-calendar/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: 'conn-1',
          friendId: 'user-uuid-1',
          title: 'Booking',
          startAt: '2026-03-25T11:00:00+09:00',
          endAt: '2026-03-25T12:00:00+09:00',
        }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(201);
    expect(dbMocks.createCalendarBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        friendId: 'friend-2',
      }),
    );
  });

  it('lists calendar bookings with null metadata when stored JSON is corrupt', async () => {
    dbMocks.getCalendarBookings.mockResolvedValue([
      {
        id: 'book-1',
        connection_id: 'conn-1',
        friend_id: 'friend-1',
        event_id: null,
        title: 'Visit',
        start_at: '2026-03-25T11:00:00+09:00',
        end_at: '2026-03-25T12:00:00+09:00',
        status: 'confirmed',
        metadata: '{not-json',
        created_at: '2026-03-25T10:00:00+09:00',
      },
    ]);

    const { calendar } = await import('../../src/routes/calendar.js');
    const app = new Hono();
    app.route('/', calendar);

    const response = await app.fetch(
      new Request('http://localhost/api/integrations/google-calendar/bookings'),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'book-1',
          connectionId: 'conn-1',
          friendId: 'friend-1',
          eventId: null,
          title: 'Visit',
          startAt: '2026-03-25T11:00:00+09:00',
          endAt: '2026-03-25T12:00:00+09:00',
          status: 'confirmed',
          metadata: null,
          createdAt: '2026-03-25T10:00:00+09:00',
        },
      ],
    });
  });
});

describe('calendar routes — admin scope guard (F3)', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((fn) => fn.mockReset());
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue(['acc-A']);
  });

  it('GET /api/integrations/google-calendar filters out cross-tenant connections', async () => {
    dbMocks.getCalendarConnections.mockResolvedValue([
      connRow('conn-A', 'acc-A'),
      connRow('conn-B', 'acc-B'),
      connRow('conn-legacy', null),
    ]);

    const mod = await import('../../src/routes/calendar.js');
    const res = await scopedCalendarApp(mod).fetch(
      new Request('http://localhost/api/integrations/google-calendar'),
      scopedEnv as never,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string }> };
    expect(body.data.map((d) => d.id)).toEqual(['conn-A']);
  });

  it('POST /connect returns 403 when body.lineAccountId is outside scope', async () => {
    const mod = await import('../../src/routes/calendar.js');
    const res = await scopedCalendarApp(mod).fetch(
      new Request('http://localhost/api/integrations/google-calendar/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendarId: 'x@example.com',
          authType: 'api_key',
          apiKey: 'k',
          lineAccountId: 'acc-B',
        }),
      }),
      scopedEnv as never,
    );

    expect(res.status).toBe(403);
    expect(dbMocks.createCalendarConnection).not.toHaveBeenCalled();
  });

  it('POST /connect returns 400 when body.lineAccountId is omitted under restricted scope', async () => {
    const mod = await import('../../src/routes/calendar.js');
    const res = await scopedCalendarApp(mod).fetch(
      new Request('http://localhost/api/integrations/google-calendar/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: 'x@example.com', authType: 'api_key', apiKey: 'k' }),
      }),
      scopedEnv as never,
    );

    expect(res.status).toBe(400);
    expect(dbMocks.createCalendarConnection).not.toHaveBeenCalled();
  });

  it('DELETE /:id returns 404 when the connection belongs to another tenant', async () => {
    dbMocks.getCalendarConnectionById.mockResolvedValue(connRow('conn-B', 'acc-B'));

    const mod = await import('../../src/routes/calendar.js');
    const res = await scopedCalendarApp(mod).fetch(
      new Request('http://localhost/api/integrations/google-calendar/conn-B', {
        method: 'DELETE',
      }),
      scopedEnv as never,
    );

    expect(res.status).toBe(404);
    expect(dbMocks.deleteCalendarConnection).not.toHaveBeenCalled();
  });

  it('POST /book returns 404 when connectionId is cross-tenant', async () => {
    dbMocks.getCalendarConnectionById.mockResolvedValue(connRow('conn-B', 'acc-B'));

    const mod = await import('../../src/routes/calendar.js');
    const res = await scopedCalendarApp(mod).fetch(
      new Request('http://localhost/api/integrations/google-calendar/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: 'conn-B',
          title: 'Visit',
          startAt: '2026-03-25T11:00:00+09:00',
          endAt: '2026-03-25T12:00:00+09:00',
        }),
      }),
      scopedEnv as never,
    );

    expect(res.status).toBe(404);
    expect(dbMocks.createCalendarBooking).not.toHaveBeenCalled();
  });

  it('GET /bookings with cross-tenant connectionId returns 404', async () => {
    dbMocks.getCalendarConnectionById.mockResolvedValue(connRow('conn-B', 'acc-B'));

    const mod = await import('../../src/routes/calendar.js');
    const res = await scopedCalendarApp(mod).fetch(
      new Request('http://localhost/api/integrations/google-calendar/bookings?connectionId=conn-B'),
      scopedEnv as never,
    );

    expect(res.status).toBe(404);
    expect(dbMocks.getCalendarBookings).not.toHaveBeenCalled();
  });
});
