import { Hono } from 'hono';
import { getBroadcastById } from '@line-crm/db';
import { createLineClient } from '@line-crm/line-sdk';
import type { Env } from '../index.js';
import { lineAccountDbOptions } from '../services/line-account-at-rest-key.js';
import { resolveLineAccessTokenForLineAccountId } from '../services/line-account-routing.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import {
  resolveLineAccountScopeForRequest,
  resourceLineAccountVisibleInScope,
} from '../services/admin-line-account-scope.js';
import { denyIfBroadcastSendSecretMissing } from '../services/broadcast-send-guard.js';
import { enforceBroadcastMassSendRateLimit } from '../services/broadcast-mass-send-rate-limit.js';
import { countSegmentRecipients } from '../services/broadcast-segment-metrics.js';
import { pushBroadcastTestToFriend } from '../services/broadcast-test-push.js';
import type { SegmentCondition } from '../services/segment-query.js';
import { fireAdminAuditLog } from '../services/admin-audit-log.js';
import { enforceRateLimit, massSendAdminRateLimitKey } from '../services/request-rate-limit.js';

const broadcastsOps = new Hono<Env>();

// POST /api/broadcasts/:id/segment-preview-count — read-only recipient count (rate limited)
broadcastsOps.post('/api/broadcasts/:id/segment-preview-count', async (c) => {
  try {
    const limited = await enforceRateLimit(c, {
      bucket: 'broadcast-segment-preview',
      db: c.env.DB,
      limit: 40,
      windowMs: 60_000,
      resolveKey: massSendAdminRateLimitKey,
    });
    if (limited) return limited;

    const id = c.req.param('id');
    const existing = await getBroadcastById(c.env.DB, id);
    if (!existing) {
      return c.json({ success: false, error: 'Broadcast not found' }, 404);
    }
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    if (!resourceLineAccountVisibleInScope(scope, existing.line_account_id)) {
      return c.json({ success: false, error: 'Broadcast not found' }, 404);
    }

    const body = await readJsonBodyWithLimit<{ conditions: SegmentCondition }>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    if (!body.conditions || !body.conditions.operator || !Array.isArray(body.conditions.rules)) {
      return c.json(
        { success: false, error: 'conditions with operator and rules array is required' },
        400,
      );
    }

    const cnt = await countSegmentRecipients(
      c.env.DB,
      body.conditions,
      existing.line_account_id ?? null,
    );
    return c.json({ success: true, data: { count: cnt } });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/broadcasts/:id/segment-preview-count error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/broadcasts/:id/test-push — push one copy to a single friend (same secret policy as mass send)
broadcastsOps.post('/api/broadcasts/:id/test-push', async (c) => {
  try {
    const denied = await denyIfBroadcastSendSecretMissing(c);
    if (denied) return denied;

    const limited = await enforceBroadcastMassSendRateLimit(c, 'broadcast-test-push');
    if (limited) return limited;

    const id = c.req.param('id');
    const existing = await getBroadcastById(c.env.DB, id);
    if (!existing) {
      return c.json({ success: false, error: 'Broadcast not found' }, 404);
    }
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    if (!resourceLineAccountVisibleInScope(scope, existing.line_account_id)) {
      return c.json({ success: false, error: 'Broadcast not found' }, 404);
    }

    const body = await readJsonBodyWithLimit<{ friendId: string; confirm?: boolean }>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    if (body.confirm !== true) {
      return c.json(
        { success: false, error: 'confirm: true is required to send a test push' },
        400,
      );
    }
    if (!body.friendId?.trim()) {
      return c.json({ success: false, error: 'friendId is required' }, 400);
    }

    const accessToken = await resolveLineAccessTokenForLineAccountId(
      c.env.DB,
      c.env.LINE_CHANNEL_ACCESS_TOKEN,
      existing.line_account_id,
      lineAccountDbOptions(c.env),
    );
    const lineClient = createLineClient(accessToken);
    try {
      const result = await pushBroadcastTestToFriend(
        c.env.DB,
        lineClient,
        id,
        body.friendId.trim(),
      );
      fireAdminAuditLog(c, {
        action: 'broadcast.test_push',
        resourceType: 'broadcast',
        resourceId: id,
      });
      return c.json({ success: true, data: result });
    } catch (e) {
      const code = e instanceof Error ? e.message : 'error';
      if (code === 'broadcast_not_found') {
        return c.json({ success: false, error: 'Broadcast not found' }, 404);
      }
      if (code === 'friend_not_found' || code === 'friend_line_account_mismatch') {
        return c.json({ success: false, error: 'Friend not found for this broadcast scope' }, 404);
      }
      if (code === 'friend_missing_line_user_id' || code === 'friend_not_following') {
        return c.json(
          { success: false, error: 'Friend cannot receive push (LINE user id or follow state)' },
          400,
        );
      }
      throw e;
    }
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/broadcasts/:id/test-push error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { broadcastsOps };
