import { Hono, type Context } from 'hono';
import {
  createAdminTrackedLink,
  deleteAdminTrackedLink,
  getAdminTrackedLinkDetail,
  issueAdminTrackedLinkPersonalizedUrl,
  listAdminTrackedLinks,
  updateAdminTrackedLink,
} from '../application/admin-tracked-links.js';
import type {
  AdminTrackedLinkCreateBody,
  AdminTrackedLinkUpdateBody,
} from '../application/admin-tracked-links.js';
import { resolvePublicTrackedLinkRedirect } from '../application/public-tracked-link-redirect.js';
import type { Env } from '../index.js';
import { trackingLinkHmacSecret } from '../services/tracking-friend-token.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import { resolveLineAccountScopeForRequest } from '../services/admin-line-account-scope.js';

const trackedLinks = new Hono<Env>();

function getBaseUrl(c: { req: { url: string } }): string {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

function jsonTrackedLinkFailure(
  c: Pick<Context<Env>, 'json'>,
  failure: Readonly<{ body: unknown; status: number }>,
) {
  return c.json(failure.body, failure.status as 400 | 403 | 404 | 500 | 503);
}

// GET /api/tracked-links — list (scoped)
trackedLinks.get('/api/tracked-links', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await listAdminTrackedLinks(
      c.env.DB,
      scope,
      c.req.query('lineAccountId'),
      getBaseUrl(c),
    );
    if (!out.ok) {
      return jsonTrackedLinkFailure(c, out);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('GET /api/tracked-links error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/tracked-links/:id/personalized-url — signed ?f= for per-friend tracking (auth required)
trackedLinks.get('/api/tracked-links/:id/personalized-url', async (c) => {
  try {
    const friendId = c.req.query('friendId')?.trim();
    if (!friendId) {
      return c.json({ success: false, error: 'friendId query parameter is required' }, 400);
    }
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await issueAdminTrackedLinkPersonalizedUrl(
      c.env.DB,
      scope,
      trackingLinkHmacSecret(c.env),
      getBaseUrl(c),
      c.req.param('id'),
      friendId,
    );
    if (!out.ok) {
      return jsonTrackedLinkFailure(c, out);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('GET /api/tracked-links/:id/personalized-url error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/tracked-links/:id — get single with click details
trackedLinks.get('/api/tracked-links/:id', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await getAdminTrackedLinkDetail(c.env.DB, scope, c.req.param('id'), getBaseUrl(c));
    if (!out.ok) {
      return jsonTrackedLinkFailure(c, out);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('GET /api/tracked-links/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/tracked-links — create
trackedLinks.post('/api/tracked-links', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<AdminTrackedLinkCreateBody>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await createAdminTrackedLink(c.env.DB, scope, body, getBaseUrl(c), fetch);
    if (!out.ok) {
      return jsonTrackedLinkFailure(c, out);
    }
    return c.json({ success: true, data: out.data }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/tracked-links error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/tracked-links/:id — partial update (name, URLs, tags, templates, active)
trackedLinks.put('/api/tracked-links/:id', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<AdminTrackedLinkUpdateBody>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await updateAdminTrackedLink(
      c.env.DB,
      scope,
      c.req.param('id'),
      body,
      getBaseUrl(c),
      fetch,
    );
    if (!out.ok) {
      return jsonTrackedLinkFailure(c, out);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/tracked-links/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/tracked-links/:id
trackedLinks.delete('/api/tracked-links/:id', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await deleteAdminTrackedLink(c.env.DB, scope, c.req.param('id'));
    if (!out.ok) {
      return jsonTrackedLinkFailure(c, out);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('DELETE /api/tracked-links/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /t/:linkId — click tracking redirect (no auth, fast redirect)
trackedLinks.get('/t/:linkId', async (c) => {
  const out = await resolvePublicTrackedLinkRedirect({
    db: c.env.DB,
    linkId: c.req.param('linkId'),
    fParam: c.req.query('f')?.trim() ?? '',
    secret: trackingLinkHmacSecret(c.env),
    fetchFn: fetch,
  });
  if (!out.ok) {
    return jsonTrackedLinkFailure(c, out);
  }

  try {
    const executionCtx = c.executionCtx as ExecutionContext;
    executionCtx.waitUntil(out.trackClick());
  } catch {
    await out.trackClick();
  }

  return c.redirect(out.redirectUrl, 302);
});

export { trackedLinks };
