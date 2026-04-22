import { Hono } from 'hono';
import { listInboxThreads } from '@line-crm/db';
import type { Env } from '../index.js';
import { clampListLimit, clampOffset } from '../services/query-limits.js';
import {
  jsonBodyForLineAccountScopeFailure,
  resolveLineAccountScopeForRequest,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';
import { escapeHtmlTextForJsonApi } from '../services/api-json-sanitizer.js';
import { sanitizeLineProfilePictureUrlForHtml } from '../services/safe-line-picture-url.js';

const inbox = new Hono<Env>();

// GET /api/inbox/threads — friends with messages_log activity (scoped)
inbox.get('/api/inbox/threads', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const lineAccountId = c.req.query('lineAccountId') ?? undefined;
    const q = validateScopedLineAccountQueryParam(scope, lineAccountId);
    if (!q.ok) {
      return c.json(jsonBodyForLineAccountScopeFailure(q), q.status);
    }

    const limit = clampListLimit(c.req.query('limit'), 50, 200);
    const offset = clampOffset(c.req.query('offset'), 500_000);

    const accFilter =
      scope.mode === 'restricted'
        ? (lineAccountId?.trim() ?? undefined)
        : lineAccountId?.trim() || undefined;

    const rows = await listInboxThreads(c.env.DB, {
      lineAccountId: accFilter,
      limit,
      offset,
    });

    return c.json({
      success: true,
      data: rows.map((r) => ({
        friendId: r.friend_id,
        friendName: r.display_name ? escapeHtmlTextForJsonApi(r.display_name) : '名前なし',
        friendPictureUrl: sanitizeLineProfilePictureUrlForHtml(r.picture_url),
        lineUserId: r.line_user_id,
        lineAccountId: r.line_account_id,
        lastContent: r.last_content ? escapeHtmlTextForJsonApi(String(r.last_content)) : null,
        lastDirection: r.last_direction,
        lastAt: r.last_at,
        incomingTotal: r.incoming_total,
      })),
    });
  } catch (err) {
    console.error('GET /api/inbox/threads error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { inbox };
