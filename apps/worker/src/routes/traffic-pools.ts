import { Hono, type Context } from 'hono';
import { getTrafficPoolBySlug } from '@line-crm/db';
import type { Env } from '../index.js';
import {
  addAdminPoolAccount,
  createAdminTrafficPool,
  deleteAdminPoolAccount,
  deleteAdminTrafficPool,
  listAdminPoolAccounts,
  listAdminTrafficPools,
  toggleAdminPoolAccount,
  updateAdminTrafficPool,
} from '../application/admin-traffic-pools.js';
import { resolveLineAccountScopeForRequest } from '../services/admin-line-account-scope.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';

const trafficPools = new Hono<Env>();

function jsonForPoolFailure(c: Context<Env>, failure: Readonly<{ body: unknown; status: number }>) {
  return c.json(failure.body, failure.status as 400 | 403 | 404 | 409);
}

// ── Public: GET /pool/:slug → 302 redirect to LIFF auth URL ────────────────
trafficPools.get('/pool/:slug', async (c) => {
  const slug = c.req.param('slug');
  const pool = await getTrafficPoolBySlug(c.env.DB, slug);
  if (!pool) return c.json({ success: false, error: 'Pool not found' }, 404);

  const baseUrl = new URL(c.req.url).origin;
  const params = new URLSearchParams();
  params.set('pool', slug);
  const blocked = new Set(['pool', 'account']);
  for (const [key, value] of new URL(c.req.url).searchParams) {
    if (!blocked.has(key)) params.set(key, value);
  }
  return c.redirect(`${baseUrl}/auth/line?${params.toString()}`, 302);
});

// ── Admin API ───────────────────────────────────────────────────────────────

trafficPools.get('/api/traffic-pools', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await listAdminTrafficPools(c.env.DB, scope);
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('GET /api/traffic-pools error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

trafficPools.post('/api/traffic-pools', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{
      slug: string;
      name: string;
      activeAccountId: string;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    if (!body.slug || !body.name || !body.activeAccountId) {
      return c.json({ success: false, error: 'slug, name, and activeAccountId are required' }, 400);
    }
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await createAdminTrafficPool(c.env.DB, scope, body);
    if (!out.ok) return jsonForPoolFailure(c, out);
    return c.json({ success: true, data: out.data }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/traffic-pools error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

trafficPools.put('/api/traffic-pools/:id', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{
      name?: string;
      activeAccountId?: string;
      isActive?: boolean;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await updateAdminTrafficPool(c.env.DB, scope, c.req.param('id'), body);
    if (!out.ok) return jsonForPoolFailure(c, out);
    return c.json({ success: true, data: out.data });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/traffic-pools/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

trafficPools.delete('/api/traffic-pools/:id', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await deleteAdminTrafficPool(c.env.DB, scope, c.req.param('id'));
    if (!out.ok) return jsonForPoolFailure(c, out);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/traffic-pools/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

trafficPools.get('/api/traffic-pools/:id/accounts', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await listAdminPoolAccounts(c.env.DB, scope, c.req.param('id'));
    if (!out.ok) return jsonForPoolFailure(c, out);
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('GET /api/traffic-pools/:id/accounts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

trafficPools.post('/api/traffic-pools/:id/accounts', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{ lineAccountId: string }>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    if (!body.lineAccountId) {
      return c.json({ success: false, error: 'lineAccountId is required' }, 400);
    }
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await addAdminPoolAccount(c.env.DB, scope, c.req.param('id'), body);
    if (!out.ok) return jsonForPoolFailure(c, out);
    return c.json({ success: true, data: out.data }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/traffic-pools/:id/accounts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

trafficPools.put('/api/traffic-pools/:id/accounts/:accountId', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{ isActive: boolean }>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await toggleAdminPoolAccount(
      c.env.DB,
      scope,
      c.req.param('id'),
      c.req.param('accountId'),
      body.isActive,
    );
    if (!out.ok) return jsonForPoolFailure(c, out);
    return c.json({ success: true, data: out.data });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/traffic-pools/:id/accounts/:accountId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

trafficPools.delete('/api/traffic-pools/:id/accounts/:accountId', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const out = await deleteAdminPoolAccount(
      c.env.DB,
      scope,
      c.req.param('id'),
      c.req.param('accountId'),
    );
    if (!out.ok) return jsonForPoolFailure(c, out);
    return c.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/traffic-pools/:id/accounts/:accountId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { trafficPools };
