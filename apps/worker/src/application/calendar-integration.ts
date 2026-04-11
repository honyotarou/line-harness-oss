/**
 * Google Calendar 連携のユースケース層（HTTP 非依存）。
 * ルートは入出力の束ねだけにし、ポリシー・外部 API・D1 の組み立てはここに閉じる。
 */
import type { CalendarBookingRow, GoogleCalendarConnectionRow } from '@line-crm/db';
import {
  createCalendarBooking,
  createCalendarConnection,
  getBookingsInRange,
  getCalendarBookingById,
  getCalendarConnectionById,
  getFriendById,
  getUserFriends,
  toJstString,
  updateCalendarBookingEventId,
} from '@line-crm/db';
import {
  decryptGoogleCalendarConnectionRow,
  encryptCalendarTokenAtRest,
} from '../services/calendar-tokens.js';
import { GoogleCalendarClient } from '../services/google-calendar.js';
import { tryParseJsonRecord } from '../services/safe-json.js';

export type CalendarIntegrationDeps = {
  db: D1Database;
  calendarTokenEncryptionSecret?: string;
};

export function mapCalendarConnectionListItem(conn: GoogleCalendarConnectionRow) {
  return {
    id: conn.id,
    calendarId: conn.calendar_id,
    authType: conn.auth_type,
    isActive: Boolean(conn.is_active),
    createdAt: conn.created_at,
    updatedAt: conn.updated_at,
  };
}

export type CalendarConnectInput = {
  calendarId: string;
  authType: string;
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
};

export async function connectGoogleCalendar(
  deps: CalendarIntegrationDeps,
  input: CalendarConnectInput,
): Promise<GoogleCalendarConnectionRow> {
  const enc = deps.calendarTokenEncryptionSecret;
  const accessToken = await encryptCalendarTokenAtRest(input.accessToken, enc);
  const refreshToken = await encryptCalendarTokenAtRest(input.refreshToken, enc);
  const apiKey = await encryptCalendarTokenAtRest(input.apiKey, enc);
  return createCalendarConnection(deps.db, {
    calendarId: input.calendarId,
    authType: input.authType,
    accessToken: accessToken ?? undefined,
    refreshToken: refreshToken ?? undefined,
    apiKey: apiKey ?? undefined,
  });
}

export function mapCreatedConnectionResponse(conn: GoogleCalendarConnectionRow) {
  return {
    id: conn.id,
    calendarId: conn.calendar_id,
    authType: conn.auth_type,
    isActive: Boolean(conn.is_active),
    createdAt: conn.created_at,
  };
}

export async function loadDecryptedCalendarConnection(
  deps: CalendarIntegrationDeps,
  connectionId: string,
): Promise<GoogleCalendarConnectionRow | null> {
  const raw = await getCalendarConnectionById(deps.db, connectionId);
  if (!raw) return null;
  return decryptGoogleCalendarConnectionRow(raw, deps.calendarTokenEncryptionSecret);
}

export type SlotComputationParams = {
  connectionId: string;
  date: string;
  slotMinutes: number;
  startHour: number;
  endHour: number;
};

export type SlotItem = { startAt: string; endAt: string; available: boolean };

export type SlotComputationResult =
  | { ok: true; slots: SlotItem[] }
  | { ok: false; status: 400 | 404; error: string };

export async function computeCalendarAvailabilitySlots(
  deps: CalendarIntegrationDeps,
  params: SlotComputationParams,
): Promise<SlotComputationResult> {
  const { connectionId, date, slotMinutes, startHour, endHour } = params;
  const stepHours = slotMinutes / 60;
  if (!Number.isFinite(stepHours) || stepHours <= 0) {
    return { ok: false, status: 400, error: 'Invalid slotMinutes' };
  }

  const conn = await loadDecryptedCalendarConnection(deps, connectionId);
  if (!conn) {
    return { ok: false, status: 404, error: 'Calendar connection not found' };
  }

  const dayStart = `${date}T${String(startHour).padStart(2, '0')}:00:00`;
  const dayEnd = `${date}T${String(endHour).padStart(2, '0')}:00:00`;
  const bookings = await getBookingsInRange(deps.db, connectionId, dayStart, dayEnd);

  let googleBusyIntervals: { start: string; end: string }[] = [];
  if (conn.access_token) {
    try {
      const gcal = new GoogleCalendarClient({
        calendarId: conn.calendar_id,
        accessToken: conn.access_token,
      });
      const timeMin = `${date}T${String(startHour).padStart(2, '0')}:00:00+09:00`;
      const timeMax = `${date}T${String(endHour).padStart(2, '0')}:00:00+09:00`;
      googleBusyIntervals = await gcal.getFreeBusy(timeMin, timeMax);
    } catch (err) {
      console.warn('Google FreeBusy API error (falling back to D1 only):', err);
    }
  }

  const slots: SlotItem[] = [];
  const baseDate = new Date(`${date}T${String(startHour).padStart(2, '0')}:00:00+09:00`);

  for (let h = startHour; h < endHour; h += slotMinutes / 60) {
    const slotStart = new Date(baseDate);
    slotStart.setMinutes(slotStart.getMinutes() + (h - startHour) * 60);
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + slotMinutes);

    const startStr = toJstString(slotStart);
    const endStr = toJstString(slotEnd);

    const isBookedInD1 = bookings.some((b) => {
      const bStart = new Date(b.start_at).getTime();
      const bEnd = new Date(b.end_at).getTime();
      return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
    });

    const isBookedInGoogle = googleBusyIntervals.some((interval) => {
      const gStart = new Date(interval.start).getTime();
      const gEnd = new Date(interval.end).getTime();
      return slotStart.getTime() < gEnd && slotEnd.getTime() > gStart;
    });

    slots.push({
      startAt: startStr,
      endAt: endStr,
      available: !isBookedInD1 && !isBookedInGoogle,
    });
  }

  return { ok: true, slots };
}

export function mapBookingRowToApi(b: CalendarBookingRow) {
  return {
    id: b.id,
    connectionId: b.connection_id,
    friendId: b.friend_id,
    eventId: b.event_id,
    title: b.title,
    startAt: b.start_at,
    endAt: b.end_at,
    status: b.status,
    metadata: b.metadata ? tryParseJsonRecord(b.metadata) : null,
    createdAt: b.created_at,
  };
}

export async function resolveFriendIdForCalendarBooking(
  db: D1Database,
  friendId: string | undefined,
): Promise<string | undefined> {
  if (!friendId) return undefined;
  const directFriend = await getFriendById(db, friendId);
  if (directFriend) return directFriend.id;
  const userFriends = await getUserFriends(db, friendId);
  const bestMatch = userFriends.find((friend) => Boolean(friend.is_following)) ?? userFriends[0];
  return bestMatch?.id;
}

export type BookCalendarInput = {
  connectionId: string;
  friendId?: string;
  title: string;
  startAt: string;
  endAt: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export async function createBookingWithOptionalGoogleEvent(
  deps: CalendarIntegrationDeps,
  body: BookCalendarInput,
): Promise<CalendarBookingRow> {
  const resolvedFriendId = await resolveFriendIdForCalendarBooking(deps.db, body.friendId);
  const booking = await createCalendarBooking(deps.db, {
    ...body,
    friendId: resolvedFriendId,
    metadata: body.metadata ? JSON.stringify(body.metadata) : undefined,
  });

  const conn = await loadDecryptedCalendarConnection(deps, body.connectionId);
  if (conn?.access_token) {
    try {
      const gcal = new GoogleCalendarClient({
        calendarId: conn.calendar_id,
        accessToken: conn.access_token,
      });
      const { eventId } = await gcal.createEvent({
        summary: body.title,
        start: body.startAt,
        end: body.endAt,
        description: body.description,
      });
      await updateCalendarBookingEventId(deps.db, booking.id, eventId);
      booking.event_id = eventId;
    } catch (err) {
      console.warn('Google Calendar createEvent error (booking still created in D1):', err);
    }
  }

  return booking;
}

export function mapCreatedBookingToApi(booking: CalendarBookingRow) {
  return {
    id: booking.id,
    connectionId: booking.connection_id,
    friendId: booking.friend_id,
    eventId: booking.event_id,
    title: booking.title,
    startAt: booking.start_at,
    endAt: booking.end_at,
    status: booking.status,
    createdAt: booking.created_at,
  };
}

/** キャンセル時にベストエフォートで Google イベントを削除する（D1 更新は呼び出し側）。 */
export async function tryDeleteGoogleEventForCancelledBooking(
  deps: CalendarIntegrationDeps,
  bookingId: string,
  status: string,
): Promise<void> {
  if (status !== 'cancelled') return;
  const booking = await getCalendarBookingById(deps.db, bookingId);
  if (!booking?.event_id || !booking.connection_id) return;
  const conn = await loadDecryptedCalendarConnection(deps, booking.connection_id);
  if (!conn?.access_token) return;
  try {
    const gcal = new GoogleCalendarClient({
      calendarId: conn.calendar_id,
      accessToken: conn.access_token,
    });
    await gcal.deleteEvent(booking.event_id);
  } catch (err) {
    console.warn('Google Calendar deleteEvent error (status still updated in D1):', err);
  }
}
