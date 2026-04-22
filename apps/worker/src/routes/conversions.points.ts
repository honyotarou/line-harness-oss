import { Hono } from 'hono';
import { createConversionPoint, deleteConversionPoint, getConversionPoints } from '@line-crm/db';
import type { Env } from '../index.js';
import {
  jsonBodyForLineAccountScopeFailure,
  resolveLineAccountScopeForRequest,
  validateScopedLineAccountBody,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';

const conversionPoints = new Hono<Env>();

conversionPoints.get('/api/conversions/points', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const lineAccountId = c.req.query('lineAccountId') ?? null;
    const q = validateScopedLineAccountQueryParam(scope, lineAccountId ?? undefined);
    if (!q.ok) {
      return c.json(jsonBodyForLineAccountScopeFailure(q), q.status);
    }
    const items = await getConversionPoints(c.env.DB, { lineAccountId });
    return c.json({
      success: true,
      data: items.map((p) => ({
        id: p.id,
        name: p.name,
        eventType: p.event_type,
        lineAccountId: p.line_account_id ?? null,
        value: p.value,
        createdAt: p.created_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/conversions/points error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

conversionPoints.post('/api/conversions/points', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const body = await readJsonBodyWithLimit<{
      name: string;
      eventType: string;
      lineAccountId?: string | null;
      value?: number | null;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);

    if (!body.name || !body.eventType) {
      return c.json({ success: false, error: 'name and eventType are required' }, 400);
    }

    const scoped = validateScopedLineAccountBody(scope, body.lineAccountId ?? null);
    if (!scoped.ok) {
      return c.json(jsonBodyForLineAccountScopeFailure(scoped), scoped.status);
    }

    const point = await createConversionPoint(c.env.DB, {
      name: body.name,
      eventType: body.eventType,
      value: body.value,
      lineAccountId: scoped.lineAccountId,
    });
    return c.json(
      {
        success: true,
        data: {
          id: point.id,
          name: point.name,
          eventType: point.event_type,
          lineAccountId: point.line_account_id ?? null,
          value: point.value,
          createdAt: point.created_at,
        },
      },
      201,
    );
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/conversions/points error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

conversionPoints.delete('/api/conversions/points/:id', async (c) => {
  try {
    await deleteConversionPoint(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/conversions/points/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { conversionPoints };
