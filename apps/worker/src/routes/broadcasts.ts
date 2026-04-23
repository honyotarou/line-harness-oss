import { Hono } from 'hono';
import type { BroadcastMessageType, BroadcastTargetType } from '@line-crm/db';
import type { SegmentCondition } from '../services/segment-query.js';
import type { Env } from '../index.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import { resolveLineAccountScopeForRequest } from '../services/admin-line-account-scope.js';
import { denyIfBroadcastSendSecretMissing } from '../services/broadcast-send-guard.js';
import { enforceBroadcastMassSendRateLimit } from '../services/broadcast-mass-send-rate-limit.js';
import { fireAdminAuditLog } from '../services/admin-audit-log.js';
import {
  createAdminBroadcast,
  deleteAdminBroadcast,
  getAdminBroadcast,
  listAdminBroadcasts,
  sendAdminBroadcastNow,
  sendAdminBroadcastSegment,
  updateAdminBroadcast,
} from '../application/admin-broadcasts.js';

const broadcasts = new Hono<Env>();

function jsonBroadcastFailure(
  c: { json: (body: unknown, status: 400 | 403 | 404 | 502) => Response },
  failure: Readonly<{ status: 400 | 403 | 404 | 502; body: unknown }>,
): Response {
  return c.json(failure.body, failure.status);
}

broadcasts.get('/api/broadcasts', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await listAdminBroadcasts(c.env.DB, scope, lineAccountId);
    if (!result.ok) return jsonBroadcastFailure(c, result);
    return c.json({ success: true, data: result.data });
  } catch (err) {
    console.error('GET /api/broadcasts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

broadcasts.get('/api/broadcasts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await getAdminBroadcast(c.env.DB, scope, id);
    if (!result.ok) return jsonBroadcastFailure(c, result);
    return c.json({ success: true, data: result.data });
  } catch (err) {
    console.error('GET /api/broadcasts/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

broadcasts.post('/api/broadcasts', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{
      title: string;
      messageType: BroadcastMessageType;
      messageContent: string;
      targetType: BroadcastTargetType;
      targetTagId?: string | null;
      scheduledAt?: string | null;
      lineAccountId?: string | null;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await createAdminBroadcast(c.env.DB, scope, body);
    if (!result.ok) return jsonBroadcastFailure(c, result);
    fireAdminAuditLog(c, {
      action: 'broadcast.create',
      resourceType: 'broadcast',
      resourceId: result.data.id,
      metadata: { title: body.title, targetType: body.targetType },
    });
    return c.json({ success: true, data: result.data }, 201);
  } catch (err) {
    console.error('POST /api/broadcasts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

broadcasts.put('/api/broadcasts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await readJsonBodyWithLimit<{
      title?: string;
      messageType?: BroadcastMessageType;
      messageContent?: string;
      targetType?: BroadcastTargetType;
      targetTagId?: string | null;
      scheduledAt?: string | null;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await updateAdminBroadcast(c.env.DB, scope, id, body);
    if (!result.ok) return jsonBroadcastFailure(c, result);
    fireAdminAuditLog(c, {
      action: 'broadcast.update',
      resourceType: 'broadcast',
      resourceId: id,
    });
    return c.json({ success: true, data: result.data });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/broadcasts/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

broadcasts.delete('/api/broadcasts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await deleteAdminBroadcast(c.env.DB, scope, id);
    if (!result.ok) return jsonBroadcastFailure(c, result);
    fireAdminAuditLog(c, {
      action: 'broadcast.delete',
      resourceType: 'broadcast',
      resourceId: id,
    });
    return c.json({ success: true, data: result.data });
  } catch (err) {
    console.error('DELETE /api/broadcasts/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

broadcasts.post('/api/broadcasts/:id/send', async (c) => {
  try {
    const denied = await denyIfBroadcastSendSecretMissing(c);
    if (denied) return denied;
    const limitedSend = await enforceBroadcastMassSendRateLimit(c, 'broadcast-send');
    if (limitedSend) return limitedSend;
    let confirmSend: { confirm?: boolean };
    try {
      confirmSend = await readJsonBodyWithLimit<{ confirm?: boolean }>(
        c.req.raw,
        DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
      );
    } catch (err) {
      const jr = jsonBodyReadErrorResponse(err);
      if (jr) return c.json(jr.body, jr.status);
      throw err;
    }
    if (confirmSend.confirm !== true) {
      return c.json(
        {
          success: false,
          error: 'confirm: true is required in the JSON body to send a broadcast',
        },
        400,
      );
    }
    const id = c.req.param('id');
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await sendAdminBroadcastNow(c.env.DB, c.env, scope, id);
    if (!result.ok) return jsonBroadcastFailure(c, result);
    fireAdminAuditLog(c, {
      action: 'broadcast.send',
      resourceType: 'broadcast',
      resourceId: id,
    });
    return c.json({ success: true, data: result.data });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/broadcasts/:id/send error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

broadcasts.post('/api/broadcasts/:id/send-segment', async (c) => {
  try {
    const deniedSeg = await denyIfBroadcastSendSecretMissing(c);
    if (deniedSeg) return deniedSeg;
    const limitedSeg = await enforceBroadcastMassSendRateLimit(c, 'broadcast-send-segment');
    if (limitedSeg) return limitedSeg;
    const id = c.req.param('id');
    const body = await readJsonBodyWithLimit<{
      confirm?: boolean;
      conditions: SegmentCondition;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    if (body.confirm !== true) {
      return c.json(
        {
          success: false,
          error: 'confirm: true is required in the JSON body to send a segment broadcast',
        },
        400,
      );
    }
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await sendAdminBroadcastSegment(c.env.DB, c.env, scope, id, body);
    if (!result.ok) return jsonBroadcastFailure(c, result);
    fireAdminAuditLog(c, {
      action: 'broadcast.send_segment',
      resourceType: 'broadcast',
      resourceId: id,
    });
    return c.json({ success: true, data: result.data });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/broadcasts/:id/send-segment error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { broadcasts };
