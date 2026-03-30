import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleCalendarClient } from '../../src/services/google-calendar.js';

describe('GoogleCalendarClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const client = () =>
    new GoogleCalendarClient({
      calendarId: 'primary@group.calendar.google.com',
      accessToken: 'test-token',
    });

  it('getFreeBusy returns busy intervals from the matching calendar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            calendars: {
              'primary@group.calendar.google.com': {
                busy: [{ start: '2026-03-01T10:00:00Z', end: '2026-03-01T11:00:00Z' }],
              },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const intervals = await client().getFreeBusy('2026-03-01T00:00:00Z', '2026-03-01T23:59:59Z');

    expect(intervals).toEqual([{ start: '2026-03-01T10:00:00Z', end: '2026-03-01T11:00:00Z' }]);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'https://www.googleapis.com/calendar/v3/freeBusy',
    );
  });

  it('getFreeBusy returns empty array when calendar has no busy slots', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            calendars: { 'primary@group.calendar.google.com': {} },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(client().getFreeBusy('a', 'b')).resolves.toEqual([]);
  });

  it('getFreeBusy throws when the API responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('quota', { status: 403 })));

    await expect(client().getFreeBusy('a', 'b')).rejects.toThrow('Google FreeBusy API error 403');
  });

  it('createEvent returns event id on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'evt-1' }), { status: 200 })),
    );

    const out = await client().createEvent({
      summary: 'Meet',
      start: '2026-03-01T10:00:00+09:00',
      end: '2026-03-01T11:00:00+09:00',
      description: 'Note',
    });

    expect(out).toEqual({ eventId: 'evt-1' });
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      summary: 'Meet',
      description: 'Note',
      start: { dateTime: '2026-03-01T10:00:00+09:00', timeZone: 'Asia/Tokyo' },
    });
  });

  it('createEvent throws when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 400 })));

    await expect(
      client().createEvent({
        summary: 'x',
        start: '2026-03-01T10:00:00+09:00',
        end: '2026-03-01T11:00:00+09:00',
      }),
    ).rejects.toThrow('Google Calendar createEvent error 400');
  });

  it('createEvent throws when id is missing in JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );

    await expect(
      client().createEvent({
        summary: 'x',
        start: '2026-03-01T10:00:00+09:00',
        end: '2026-03-01T11:00:00+09:00',
      }),
    ).rejects.toThrow('response missing event id');
  });

  it('deleteEvent resolves on 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(client().deleteEvent('evt-1')).resolves.toBeUndefined();
  });

  it('deleteEvent resolves on 410 (already deleted)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 410 })));

    await expect(client().deleteEvent('evt-1')).resolves.toBeUndefined();
  });

  it('deleteEvent throws on other error statuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));

    await expect(client().deleteEvent('evt-1')).rejects.toThrow(
      'Google Calendar deleteEvent error 500',
    );
  });
});
