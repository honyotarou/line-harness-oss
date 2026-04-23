import { Hono } from 'hono';
import {
  createAdminTag,
  deleteAdminTag,
  listAdminTags,
  type CreateAdminTagBody,
} from '../application/admin-tags.js';
import type { Env } from '../index.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import { resolveLineAccountScopeForRequest } from '../services/admin-line-account-scope.js';

const tags = new Hono<Env>();

function jsonTagFailure(
  c: { json: (body: unknown, status?: 400 | 403 | 404) => Response },
  failure: Readonly<{ body: unknown; status: number }>,
) {
  return c.json(failure.body, failure.status as 400 | 403 | 404);
}

tags.get('/api/tags', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await listAdminTags(c.env.DB, scope, c.req.query('lineAccountId'));
    if (!out.ok) {
      return jsonTagFailure(c, out);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('GET /api/tags error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

tags.post('/api/tags', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<CreateAdminTagBody>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await createAdminTag(c.env.DB, scope, body);
    if (!out.ok) {
      return jsonTagFailure(c, out);
    }
    return c.json({ success: true, data: out.data }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/tags error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

tags.delete('/api/tags/:id', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await deleteAdminTag(c.env.DB, scope, c.req.param('id'));
    if (!out.ok) {
      return jsonTagFailure(c, out);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('DELETE /api/tags/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { tags };
