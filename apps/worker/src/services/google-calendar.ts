// Google Calendar API client

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';
const TIMEZONE = 'Asia/Tokyo';

/** Reject calendar ids that are not primary, group calendar, UUID, or email-shaped (pentest / URL segment hygiene). */
export function assertValidGoogleCalendarId(calendarId: string): void {
  const id = calendarId.trim();
  if (id.length === 0 || id.length > 1024 || id !== calendarId) {
    throw new Error('Invalid Google Calendar id');
  }
  const lower = id.toLowerCase();
  if (lower === 'primary') {
    return;
  }
  if (/^[\w.-]+@group\.calendar\.google\.com$/i.test(id)) {
    return;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return;
  }
  if (/^[^\s#/?<>"']+@[^\s#/?<>"']+\.[^\s#/?<>"']+$/i.test(id)) {
    return;
  }
  throw new Error('Invalid Google Calendar id');
}

export type GoogleCalendarConfig = Readonly<{
  calendarId: string;
  accessToken: string;
}>;

export type BusyInterval = Readonly<{
  start: string;
  end: string;
}>;

export type CreateEventInput = Readonly<{
  summary: string;
  start: string; // ISO datetime string
  end: string; // ISO datetime string
  description?: string;
}>;

export type GoogleCalendarClient = Readonly<{
  getFreeBusy: (timeMin: string, timeMax: string) => Promise<BusyInterval[]>;
  createEvent: (event: CreateEventInput) => Promise<Readonly<{ eventId: string }>>;
  deleteEvent: (eventId: string) => Promise<void>;
}>;

export function createGoogleCalendarClient(config: GoogleCalendarConfig): GoogleCalendarClient {
  assertValidGoogleCalendarId(config.calendarId);

  return {
    async getFreeBusy(timeMin: string, timeMax: string): Promise<BusyInterval[]> {
      const url = `${GCAL_BASE}/freeBusy`;
      const body = {
        timeMin,
        timeMax,
        items: [{ id: config.calendarId }],
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Google FreeBusy API error ${res.status}: ${text}`);
      }

      const data = (await res.json()) as {
        calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
      };

      const calendarData = data.calendars?.[config.calendarId];
      return calendarData?.busy ?? [];
    },

    async createEvent(event: CreateEventInput): Promise<Readonly<{ eventId: string }>> {
      const url = `${GCAL_BASE}/calendars/${encodeURIComponent(config.calendarId)}/events`;

      const body = {
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.start, timeZone: TIMEZONE },
        end: { dateTime: event.end, timeZone: TIMEZONE },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Google Calendar createEvent error ${res.status}: ${text}`);
      }

      const data = (await res.json()) as { id?: string };
      if (!data.id) {
        throw new Error('Google Calendar createEvent: response missing event id');
      }

      return { eventId: data.id };
    },

    async deleteEvent(eventId: string): Promise<void> {
      const url = `${GCAL_BASE}/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(eventId)}`;

      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
      });

      // 204 = success, 410 = already deleted — both are acceptable
      if (!res.ok && res.status !== 410) {
        const text = await res.text().catch(() => '');
        throw new Error(`Google Calendar deleteEvent error ${res.status}: ${text}`);
      }
    },
  };
}
