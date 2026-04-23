import { Hono } from 'hono';
import { listAdminAuditLogs } from '@line-crm/db';
import type { Env } from '../index.js';
import { resolveLineAccountScopeForRequest } from '../services/admin-line-account-scope.js';
import {
  deepEscapeHtmlStringLeaves,
  escapeHtmlTextForJsonApi,
} from '../services/api-json-sanitizer.js';
import { tryParseJsonRecord } from '../services/safe-json.js';

const adminAudit = new Hono<Env>();

adminAudit.get('/api/admin/audit-log', async (c) => {
  try {
    // F5b: admin_audit_log has no per-tenant column and contains cross-tenant
    // operator / resource / email data. Treat it as owner-only: a restricted
    // (per-tenant) principal must not enumerate other tenants' audit trail.
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    if (scope.mode !== 'all') {
      return c.json(
        {
          success: false,
          error: 'Forbidden: admin audit log requires an unrestricted admin principal',
        },
        403,
      );
    }

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
