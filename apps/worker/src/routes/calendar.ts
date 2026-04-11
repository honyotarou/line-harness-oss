import { Hono } from 'hono';
import {
  getCalendarConnections,
  deleteCalendarConnection,
  getCalendarBookings,
  updateCalendarBookingStatus,
} from '@line-crm/db';
import {
  computeCalendarAvailabilitySlots,
  connectGoogleCalendar,
  createBookingWithOptionalGoogleEvent,
  mapBookingRowToApi,
  mapCalendarConnectionListItem,
  mapCreatedBookingToApi,
  mapCreatedConnectionResponse,
  tryDeleteGoogleEventForCancelledBooking,
} from '../application/calendar-integration.js';
import type { Env } from '../index.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import { clampIntInRange } from '../services/query-limits.js';

const calendar = new Hono<Env>();

function calendarDeps(c: { env: Env['Bindings'] }) {
  return {
    db: c.env.DB,
    calendarTokenEncryptionSecret: c.env.CALENDAR_TOKEN_ENCRYPTION_SECRET,
  };
}

// ========== 接続管理 ==========

calendar.get('/api/integrations/google-calendar', async (c) => {
  try {
    const items = await getCalendarConnections(c.env.DB);
    return c.json({
      success: true,
      data: items.map(mapCalendarConnectionListItem),
    });
  } catch (err) {
    console.error('GET /api/integrations/google-calendar error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.post('/api/integrations/google-calendar/connect', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{
      calendarId: string;
      authType: string;
      accessToken?: string;
      refreshToken?: string;
      apiKey?: string;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    if (!body.calendarId) return c.json({ success: false, error: 'calendarId is required' }, 400);
    const conn = await connectGoogleCalendar(calendarDeps(c), body);
    return c.json(
      {
        success: true,
        data: mapCreatedConnectionResponse(conn),
      },
      201,
    );
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/integrations/google-calendar/connect error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.delete('/api/integrations/google-calendar/:id', async (c) => {
  try {
    await deleteCalendarConnection(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/integrations/google-calendar/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 空きスロット取得 ==========

calendar.get('/api/integrations/google-calendar/slots', async (c) => {
  try {
    const connectionId = c.req.query('connectionId');
    const date = c.req.query('date');
    const slotMinutes = clampIntInRange(c.req.query('slotMinutes'), 60, 15, 180);
    const startHour = clampIntInRange(c.req.query('startHour'), 9, 0, 23);
    let endHour = clampIntInRange(c.req.query('endHour'), 18, 0, 24);
    if (endHour <= startHour) {
      endHour = Math.min(startHour + 1, 24);
    }

    if (!connectionId || !date) {
      return c.json({ success: false, error: 'connectionId and date are required' }, 400);
    }

    const result = await computeCalendarAvailabilitySlots(calendarDeps(c), {
      connectionId,
      date,
      slotMinutes,
      startHour,
      endHour,
    });
    if (!result.ok) {
      return c.json({ success: false, error: result.error }, result.status);
    }
    return c.json({ success: true, data: result.slots });
  } catch (err) {
    console.error('GET /api/integrations/google-calendar/slots error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 予約管理 ==========

calendar.get('/api/integrations/google-calendar/bookings', async (c) => {
  try {
    const connectionId = c.req.query('connectionId');
    const friendId = c.req.query('friendId');
    const items = await getCalendarBookings(c.env.DB, {
      connectionId: connectionId ?? undefined,
      friendId: friendId ?? undefined,
    });
    return c.json({
      success: true,
      data: items.map(mapBookingRowToApi),
    });
  } catch (err) {
    console.error('GET /api/integrations/google-calendar/bookings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.post('/api/integrations/google-calendar/book', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{
      connectionId: string;
      friendId?: string;
      title: string;
      startAt: string;
      endAt: string;
      description?: string;
      metadata?: Record<string, unknown>;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    if (!body.connectionId || !body.title || !body.startAt || !body.endAt) {
      return c.json(
        { success: false, error: 'connectionId, title, startAt, endAt are required' },
        400,
      );
    }

    const booking = await createBookingWithOptionalGoogleEvent(calendarDeps(c), body);
    return c.json({ success: true, data: mapCreatedBookingToApi(booking) }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/integrations/google-calendar/book error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.put('/api/integrations/google-calendar/bookings/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await readJsonBodyWithLimit<{ status: string }>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );

    await tryDeleteGoogleEventForCancelledBooking(calendarDeps(c), id, status);
    await updateCalendarBookingStatus(c.env.DB, id, status);
    return c.json({ success: true, data: null });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/integrations/google-calendar/bookings/:id/status error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { calendar };
