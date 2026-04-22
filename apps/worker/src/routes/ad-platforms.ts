import { Hono } from 'hono';
import {
  listAdPlatformConnections,
  getAdPlatformConnectionById,
  createAdPlatformConnection,
  updateAdPlatformConnection,
  deleteAdPlatformConnection,
  type AdPlatformConnectionRow,
  type AdPlatformProvider,
} from '@line-crm/db';
import { syncAdPlatformConnection } from '../services/ad-platform-outbound-sync.js';
import { fireAdminAuditLog } from '../services/admin-audit-log.js';
import { enforceRateLimit, massSendAdminRateLimitKey } from '../services/request-rate-limit.js';
import type { Env } from '../index.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import {
  jsonBodyForLineAccountScopeFailure,
  resolveLineAccountScopeForRequest,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountBody,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';

const adPlatforms = new Hono<Env>();

function serialize(row: AdPlatformConnectionRow) {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    lineAccountId: row.line_account_id,
    externalAccountRef: row.external_account_ref,
    hasCredentials: Boolean(row.credentials_enc?.trim()),
    metadata: (() => {
      try {
        return JSON.parse(row.metadata_json) as unknown;
      } catch {
        return {};
      }
    })(),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

adPlatforms.get('/api/ad-platforms', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const lineAccountId = c.req.query('lineAccountId') ?? undefined;
    const q = validateScopedLineAccountQueryParam(scope, lineAccountId);
    if (!q.ok) {
      return c.json(jsonBodyForLineAccountScopeFailure(q), q.status);
    }
    const acc =
      scope.mode === 'restricted'
        ? (lineAccountId?.trim() ?? undefined)
        : lineAccountId?.trim() || undefined;
    const rows = await listAdPlatformConnections(c.env.DB, acc);
    return c.json({ success: true, data: rows.map(serialize) });
  } catch (err) {
    console.error('GET /api/ad-platforms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

adPlatforms.get('/api/ad-platforms/:id', async (c) => {
  try {
    const row = await getAdPlatformConnectionById(c.env.DB, c.req.param('id'));
    if (!row) return c.json({ success: false, error: 'Not found' }, 404);
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    if (!resourceLineAccountVisibleInScope(scope, row.line_account_id)) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }
    return c.json({ success: true, data: serialize(row) });
  } catch (err) {
    console.error('GET /api/ad-platforms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

adPlatforms.post('/api/ad-platforms', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const body = await readJsonBodyWithLimit<{
      provider: AdPlatformProvider;
      name: string;
      lineAccountId?: string | null;
      externalAccountRef?: string | null;
      credentialsEnc?: string | null;
      metadata?: Record<string, unknown>;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);

    if (!body.provider || !body.name?.trim()) {
      return c.json({ success: false, error: 'provider and name are required' }, 400);
    }
    const allowed: AdPlatformProvider[] = ['meta', 'google', 'tiktok', 'x'];
    if (!allowed.includes(body.provider)) {
      return c.json({ success: false, error: 'invalid provider' }, 400);
    }

    const scoped = validateScopedLineAccountBody(scope, body.lineAccountId ?? null);
    if (!scoped.ok) {
      return c.json(jsonBodyForLineAccountScopeFailure(scoped), scoped.status);
    }
    if (scope.mode === 'restricted' && !scoped.lineAccountId) {
      return c.json({ success: false, error: 'lineAccountId is required for this principal' }, 400);
    }

    const row = await createAdPlatformConnection(c.env.DB, {
      provider: body.provider,
      name: body.name.trim(),
      lineAccountId: scoped.lineAccountId,
      externalAccountRef: body.externalAccountRef ?? null,
      credentialsEnc: body.credentialsEnc ?? null,
      metadataJson: body.metadata ? JSON.stringify(body.metadata) : '{}',
    });
    return c.json({ success: true, data: serialize(row) }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/ad-platforms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

adPlatforms.put('/api/ad-platforms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await getAdPlatformConnectionById(c.env.DB, id);
    if (!existing) return c.json({ success: false, error: 'Not found' }, 404);
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    if (!resourceLineAccountVisibleInScope(scope, existing.line_account_id)) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }

    const body = await readJsonBodyWithLimit<{
      name?: string;
      externalAccountRef?: string | null;
      credentialsEnc?: string | null;
      metadata?: Record<string, unknown>;
      isActive?: boolean;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);

    const updated = await updateAdPlatformConnection(c.env.DB, id, {
      name: body.name,
      externalAccountRef: body.externalAccountRef,
      credentialsEnc: body.credentialsEnc,
      metadataJson: body.metadata !== undefined ? JSON.stringify(body.metadata) : undefined,
      isActive: body.isActive,
    });
    return c.json({ success: true, data: serialize(updated!) });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/ad-platforms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

adPlatforms.delete('/api/ad-platforms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await getAdPlatformConnectionById(c.env.DB, id);
    if (!existing) return c.json({ success: false, error: 'Not found' }, 404);
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    if (!resourceLineAccountVisibleInScope(scope, existing.line_account_id)) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }
    await deleteAdPlatformConnection(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/ad-platforms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/ad-platforms/:id/sync — outbound credential check when AD_PLATFORM_OUTBOUND_ENABLED is on
adPlatforms.post('/api/ad-platforms/:id/sync', async (c) => {
  const enabled = c.env.AD_PLATFORM_OUTBOUND_ENABLED?.trim().toLowerCase();
  if (enabled !== '1' && enabled !== 'true' && enabled !== 'yes' && enabled !== 'on') {
    return c.json(
      {
        success: false,
        error:
          'Ad platform outbound sync is disabled. Set AD_PLATFORM_OUTBOUND_ENABLED=1 and required provider secrets before enabling live API calls.',
      },
      501,
    );
  }
  const limited = await enforceRateLimit(c, {
    bucket: 'ad-platform-sync',
    db: c.env.DB,
    limit: 30,
    windowMs: 60_000,
    resolveKey: massSendAdminRateLimitKey,
  });
  if (limited) return limited;

  const id = c.req.param('id');
  const row = await getAdPlatformConnectionById(c.env.DB, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
  if (!resourceLineAccountVisibleInScope(scope, row.line_account_id)) {
    return c.json({ success: false, error: 'Not found' }, 404);
  }

  let result: Awaited<ReturnType<typeof syncAdPlatformConnection>>;
  try {
    result = await syncAdPlatformConnection(row);
  } catch (err) {
    console.error('POST /api/ad-platforms/:id/sync error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }

  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(row.metadata_json || '{}') as Record<string, unknown>;
  } catch {
    meta = {};
  }
  const stamp = new Date().toISOString();
  meta.lastOutboundSyncAt = stamp;
  if (result.ok) {
    meta.lastOutboundSyncOk = true;
    meta.lastOutboundSyncSummary = result.summary;
    delete meta.lastOutboundSyncError;
  } else {
    meta.lastOutboundSyncOk = false;
    meta.lastOutboundSyncError = result.error.slice(0, 500);
  }
  await updateAdPlatformConnection(c.env.DB, id, { metadataJson: JSON.stringify(meta) });

  fireAdminAuditLog(c, {
    action: 'ad_platform.sync',
    resourceType: 'ad_platform_connection',
    resourceId: id,
    metadata: { ok: result.ok, provider: row.provider },
  });

  if (!result.ok) {
    const status = result.upstreamStatus && result.upstreamStatus >= 400 ? 502 : 400;
    return c.json({ success: false, error: result.error }, status);
  }

  const fresh = await getAdPlatformConnectionById(c.env.DB, id);
  if (!fresh) return c.json({ success: false, error: 'Not found' }, 404);
  return c.json({
    success: true,
    data: {
      ...serialize(fresh),
      sync: { checkedAt: result.checkedAt, summary: result.summary },
    },
  });
});

export { adPlatforms };
