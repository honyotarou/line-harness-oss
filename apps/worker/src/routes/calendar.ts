import { Hono, type Context } from 'hono';
import {
  createAdminCalendarBooking,
  createAdminCalendarConnection,
  computeAdminCalendarSlots,
  deleteAdminCalendarConnection,
  listAdminCalendarBookings,
  listAdminCalendarConnections,
  updateAdminCalendarBookingStatus,
} from '../application/admin-calendar.js';
import type { Env } from '../index.js';
import { resolveLineAccountScopeForRequest } from '../services/admin-line-account-scope.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import { clampIntInRange } from '../services/query-limits.js';
import { enforceRateLimit } from '../services/request-rate-limit.js';
import { fireAdminAuditLog } from '../services/admin-audit-log.js';

const calendar = new Hono<Env>();
const CALENDAR_API_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

calendar.use('*', async (c, next) => {
  const limited = await enforceRateLimit(c, {
    bucket: 'google-calendar-integration',
    db: c.env.DB,
    limit: CALENDAR_API_RATE_LIMIT.limit,
    windowMs: CALENDAR_API_RATE_LIMIT.windowMs,
  });
  if (limited) return limited;
  return next();
});

function jsonForCalendarFailure(
  c: Context<Env>,
  failure: Readonly<{ body: unknown; status: number }>,
) {
  return c.json(failure.body, failure.status as 400 | 403 | 404);
}

calendar.get('/api/integrations/google-calendar', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await listAdminCalendarConnections(c.env.DB, scope);
    return c.json({ success: true, data: out.data });
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
      lineAccountId?: string | null;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    if (!body.calendarId) return c.json({ success: false, error: 'calendarId is required' }, 400);

    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await createAdminCalendarConnection(c.env, scope, body);
    if (!out.ok) return jsonForCalendarFailure(c, out);

    fireAdminAuditLog(c, {
      action: 'calendar.connection.create',
      resourceType: 'google_calendar_connection',
      resourceId: out.data.id,
      metadata: {
        calendarId: body.calendarId,
        authType: body.authType,
        hasAccessToken: Boolean(body.accessToken?.trim()),
        hasRefreshToken: Boolean(body.refreshToken?.trim()),
        hasApiKey: Boolean(body.apiKey?.trim()),
        lineAccountId: out.lineAccountId,
      },
    });
    return c.json({ success: true, data: out.data }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/integrations/google-calendar/connect error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.delete('/api/integrations/google-calendar/:id', async (c) => {
  try {
    const cid = c.req.param('id');
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await deleteAdminCalendarConnection(c.env.DB, scope, cid);
    if (!out.ok) return jsonForCalendarFailure(c, out);
    fireAdminAuditLog(c, {
      action: 'calendar.connection.delete',
      resourceType: 'google_calendar_connection',
      resourceId: cid,
    });
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/integrations/google-calendar/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.get('/api/integrations/google-calendar/slots', async (c) => {
  try {
    const connectionId = c.req.query('connectionId');
    const date = c.req.query('date');
    const slotMinutes = clampIntInRange(c.req.query('slotMinutes'), 60, 15, 180);
    const startHour = clampIntInRange(c.req.query('startHour'), 9, 0, 23);
    let endHour = clampIntInRange(c.req.query('endHour'), 18, 0, 24);
    if (endHour <= startHour) endHour = Math.min(startHour + 1, 24);

    if (!connectionId || !date) {
      return c.json({ success: false, error: 'connectionId and date are required' }, 400);
    }

    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await computeAdminCalendarSlots(c.env, scope, {
      connectionId,
      date,
      slotMinutes,
      startHour,
      endHour,
    });
    if (!out.ok) return jsonForCalendarFailure(c, out);
    return c.json({ success: true, data: out.slots });
  } catch (err) {
    console.error('GET /api/integrations/google-calendar/slots error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.get('/api/integrations/google-calendar/bookings', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await listAdminCalendarBookings(c.env.DB, scope, {
      connectionId: c.req.query('connectionId') ?? undefined,
      friendId: c.req.query('friendId') ?? undefined,
    });
    if (!out.ok) return jsonForCalendarFailure(c, out);
    return c.json({ success: true, data: out.data });
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
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await createAdminCalendarBooking(c.env, scope, body);
    if (!out.ok) return jsonForCalendarFailure(c, out);
    return c.json({ success: true, data: out.data }, 201);
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
    await updateAdminCalendarBookingStatus(c.env, id, status);
    return c.json({ success: true, data: null });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/integrations/google-calendar/bookings/:id/status error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { calendar };
