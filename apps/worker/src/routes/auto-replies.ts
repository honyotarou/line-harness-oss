import { Hono } from 'hono';
import {
  adminCreateAutoReply,
  adminDeleteAutoReply,
  adminGetAutoReplyById,
  adminListAutoReplies,
  adminUpdateAutoReply,
} from '../application/admin-auto-replies.js';
import type { Env } from '../index.js';
import { resolveLineAccountScopeForRequest } from '../services/admin-line-account-scope.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';

const autoReplies = new Hono<Env>();

// GET /api/auto-replies — list (optional ?accountId filter; tenant scope enforced)
autoReplies.get('/api/auto-replies', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const accountId = c.req.query('accountId')?.trim() || undefined;
    const out = await adminListAutoReplies(c.env.DB, scope, accountId);
    if (!out.ok) {
      return c.json(out.body, out.status);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('GET /api/auto-replies error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/auto-replies/:id
autoReplies.get('/api/auto-replies/:id', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await adminGetAutoReplyById(c.env.DB, scope, c.req.param('id'));
    if (!out.ok) {
      return c.json(out.body, out.status);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('GET /api/auto-replies/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/auto-replies
autoReplies.post('/api/auto-replies', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const body = await readJsonBodyWithLimit<{
      keyword: string;
      matchType?: 'exact' | 'contains';
      responseType?: string;
      responseContent: string;
      lineAccountId?: string | null;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);

    if (!body.keyword?.trim()) {
      return c.json({ success: false, error: 'keyword is required' }, 400);
    }
    if (!body.responseContent?.trim()) {
      return c.json({ success: false, error: 'responseContent is required' }, 400);
    }

    const out = await adminCreateAutoReply(c.env.DB, scope, {
      keyword: body.keyword,
      matchType: body.matchType,
      responseType: body.responseType,
      responseContent: body.responseContent,
      lineAccountId: body.lineAccountId,
    });
    if (!out.ok) {
      return c.json(out.body, out.status);
    }
    return c.json({ success: true, data: out.data }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/auto-replies error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/auto-replies/:id
autoReplies.put('/api/auto-replies/:id', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const body = await readJsonBodyWithLimit<{
      keyword?: string;
      matchType?: 'exact' | 'contains';
      responseType?: string;
      responseContent?: string;
      lineAccountId?: string | null;
      isActive?: boolean;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);

    const out = await adminUpdateAutoReply(c.env.DB, scope, c.req.param('id'), body);
    if (!out.ok) {
      return c.json(out.body, out.status);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/auto-replies/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/auto-replies/:id
autoReplies.delete('/api/auto-replies/:id', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await adminDeleteAutoReply(c.env.DB, scope, c.req.param('id'));
    if (!out.ok) {
      return c.json(out.body, out.status);
    }
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/auto-replies/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { autoReplies };
