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
}));

vi.mock('@line-crm/db', () => dbMocks);

vi.mock('../../src/services/google-calendar.js', () => ({
  GoogleCalendarClient: vi.fn().mockImplementation(() => ({
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
    dbMocks.getCalendarConnectionById.mockResolvedValue(null);

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
});
