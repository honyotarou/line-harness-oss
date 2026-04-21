import { Hono } from 'hono';
import {
  addPoolAccount,
  createTrafficPool,
  deleteTrafficPool,
  getPoolAccounts,
  getTrafficPoolById,
  getTrafficPoolBySlug,
  getTrafficPools,
  removePoolAccount,
  togglePoolAccount,
  updateTrafficPool,
} from '@line-crm/db';
import type { PoolAccountWithDetails, TrafficPoolWithAccount } from '@line-crm/db';
import type { Env } from '../index.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';

const trafficPools = new Hono<Env>();

function serialize(pool: TrafficPoolWithAccount) {
  return {
    id: pool.id,
    slug: pool.slug,
    name: pool.name,
    activeAccountId: pool.active_account_id,
    accountName: pool.account_name,
    liffId: pool.liff_id,
    isActive: Boolean(pool.is_active),
    createdAt: pool.created_at,
    updatedAt: pool.updated_at,
  };
}

function serializePoolAccount(pa: PoolAccountWithDetails) {
  return {
    id: pa.id,
    poolId: pa.pool_id,
    lineAccountId: pa.line_account_id,
    accountName: pa.account_name,
    liffId: pa.liff_id,
    isActive: Boolean(pa.is_active),
    createdAt: pa.created_at,
  };
}

// ── Public: GET /pool/:slug → 302 redirect to LIFF auth URL ────────────────

trafficPools.get('/pool/:slug', async (c) => {
  const slug = c.req.param('slug');
  const pool = await getTrafficPoolBySlug(c.env.DB, slug);

  if (!pool) {
    return c.json({ success: false, error: 'Pool not found' }, 404);
  }

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
    const pools = await getTrafficPools(c.env.DB);
    return c.json({ success: true, data: pools.map(serialize) });
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

    const pool = await createTrafficPool(c.env.DB, {
      slug: body.slug,
      name: body.name,
      activeAccountId: body.activeAccountId,
    });
    return c.json({ success: true, data: serialize(pool) }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/traffic-pools error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

trafficPools.put('/api/traffic-pools/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await readJsonBodyWithLimit<{
      name?: string;
      activeAccountId?: string;
      isActive?: boolean;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);

    const updated = await updateTrafficPool(c.env.DB, id, {
      name: body.name,
      activeAccountId: body.activeAccountId,
      isActive: body.isActive,
    });

    if (!updated) {
      return c.json({ success: false, error: 'Traffic pool not found' }, 404);
    }
    return c.json({ success: true, data: serialize(updated) });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/traffic-pools/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

trafficPools.delete('/api/traffic-pools/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await getTrafficPoolById(c.env.DB, id);
    if (!existing) {
      return c.json({ success: false, error: 'Traffic pool not found' }, 404);
    }
    await deleteTrafficPool(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/traffic-pools/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

trafficPools.get('/api/traffic-pools/:id/accounts', async (c) => {
  try {
    const accounts = await getPoolAccounts(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: accounts.map(serializePoolAccount) });
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
    const account = await addPoolAccount(c.env.DB, c.req.param('id'), body.lineAccountId);
    return c.json({ success: true, data: account }, 201);
  } catch (err: unknown) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE constraint')) {
      return c.json({ success: false, error: 'Account already in this pool' }, 409);
    }
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
    const result = await togglePoolAccount(c.env.DB, c.req.param('accountId'), body.isActive);
    if (!result) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: result });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/traffic-pools/:id/accounts/:accountId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

trafficPools.delete('/api/traffic-pools/:id/accounts/:accountId', async (c) => {
  try {
    const deleted = await removePoolAccount(c.env.DB, c.req.param('accountId'));
    if (!deleted) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/traffic-pools/:id/accounts/:accountId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { trafficPools };
