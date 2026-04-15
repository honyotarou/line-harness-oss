import { Hono } from 'hono';
import { listAdminAuditLogs } from '@line-crm/db';
import type { Env } from '../index.js';
import {
  deepEscapeHtmlStringLeaves,
  escapeHtmlTextForJsonApi,
} from '../services/api-json-sanitizer.js';
import { tryParseJsonRecord } from '../services/safe-json.js';

const adminAudit = new Hono<Env>();

adminAudit.get('/api/admin/audit-log', async (c) => {
  try {
    const rawLimit = Number(c.req.query('limit') ?? '50');
    const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
    const rawOffset = Number(c.req.query('offset') ?? '0');
    const offset = Number.isFinite(rawOffset) ? rawOffset : 0;

    const rows = await listAdminAuditLogs(c.env.DB, { limit, offset });
    return c.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        action: escapeHtmlTextForJsonApi(r.action),
        actorEmail: r.actor_email ? escapeHtmlTextForJsonApi(r.actor_email) : null,
        actorKind: escapeHtmlTextForJsonApi(r.actor_kind),
        resourceType: r.resource_type ? escapeHtmlTextForJsonApi(r.resource_type) : null,
        resourceId: r.resource_id ? escapeHtmlTextForJsonApi(r.resource_id) : null,
        metadata: deepEscapeHtmlStringLeaves(tryParseJsonRecord(r.metadata || '{}') ?? {}),
        requestPath: r.request_path ? escapeHtmlTextForJsonApi(r.request_path) : null,
        ipHash: r.ip_hash ? escapeHtmlTextForJsonApi(r.ip_hash) : null,
      })),
    });
  } catch (err) {
    console.error('GET /api/admin/audit-log error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { adminAudit };
