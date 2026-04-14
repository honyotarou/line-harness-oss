import { Hono } from 'hono';
import {
  getConversionEvents,
  getConversionReport,
  getFriendById,
  trackConversion,
} from '@line-crm/db';
import type { Env } from '../index.js';
import { clampListLimit, clampOffset } from '../services/query-limits.js';
import {
  resolveLineAccountScopeForRequest,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';

const conversionEvents = new Hono<Env>();

conversionEvents.post('/api/conversions/track', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const body = await readJsonBodyWithLimit<{
      conversionPointId: string;
      friendId: string;
      userId?: string | null;
      affiliateCode?: string | null;
      metadata?: Record<string, unknown> | null;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);

    if (!body.conversionPointId || !body.friendId) {
      return c.json({ success: false, error: 'conversionPointId and friendId are required' }, 400);
    }

    const friend = await getFriendById(c.env.DB, body.friendId);
    const friendLineAccountId = friend?.line_account_id ?? null;
    if (!resourceLineAccountVisibleInScope(scope, friendLineAccountId)) {
      return c.json({ success: false, error: 'Forbidden: friend is outside scope' }, 403);
    }

    const event = await trackConversion(c.env.DB, {
      conversionPointId: body.conversionPointId,
      friendId: body.friendId,
      lineAccountId: friendLineAccountId,
      userId: body.userId,
      affiliateCode: body.affiliateCode,
      metadata: body.metadata ? JSON.stringify(body.metadata) : null,
    });

    return c.json(
      {
        success: true,
        data: {
          id: event.id,
          conversionPointId: event.conversion_point_id,
          friendId: event.friend_id,
          userId: event.user_id,
          affiliateCode: event.affiliate_code,
          metadata: event.metadata,
          lineAccountId: event.line_account_id ?? null,
          createdAt: event.created_at,
        },
      },
      201,
    );
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/conversions/track error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

conversionEvents.get('/api/conversions/events', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const lineAccountId = c.req.query('lineAccountId') ?? null;
    const q = validateScopedLineAccountQueryParam(scope, lineAccountId ?? undefined);
    if (!q.ok) {
      return c.json({ success: false, error: q.error }, q.status);
    }
    const events = await getConversionEvents(c.env.DB, {
      conversionPointId: c.req.query('conversionPointId'),
      friendId: c.req.query('friendId'),
      affiliateCode: c.req.query('affiliateCode'),
      lineAccountId,
      startDate: c.req.query('startDate'),
      endDate: c.req.query('endDate'),
      limit: clampListLimit(c.req.query('limit'), 100, 500),
      offset: clampOffset(c.req.query('offset'), 500_000),
    });

    return c.json({
      success: true,
      data: events.map((e) => ({
        id: e.id,
        conversionPointId: e.conversion_point_id,
        friendId: e.friend_id,
        userId: e.user_id,
        affiliateCode: e.affiliate_code,
        metadata: e.metadata,
        lineAccountId: e.line_account_id ?? null,
        createdAt: e.created_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/conversions/events error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

conversionEvents.get('/api/conversions/report', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const lineAccountId = c.req.query('lineAccountId') ?? null;
    const q = validateScopedLineAccountQueryParam(scope, lineAccountId ?? undefined);
    if (!q.ok) {
      return c.json({ success: false, error: q.error }, q.status);
    }
    const report = await getConversionReport(c.env.DB, {
      startDate: c.req.query('startDate'),
      endDate: c.req.query('endDate'),
      lineAccountId,
    });

    return c.json({ success: true, data: report });
  } catch (err) {
    console.error('GET /api/conversions/report error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { conversionEvents };
