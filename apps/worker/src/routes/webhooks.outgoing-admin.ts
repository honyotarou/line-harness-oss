import { Hono } from 'hono';
import {
  createOutgoingWebhook,
  deleteOutgoingWebhook,
  getOutgoingWebhookById,
  getOutgoingWebhooks,
  updateOutgoingWebhook,
} from '@line-crm/db';
import type { Env } from '../index.js';
import { assertHttpsOutboundUrlResolvedSafe } from '../services/outbound-url-resolve.js';
import {
  mapOutgoingWebhookAdminCreated,
  mapOutgoingWebhookAdminListItem,
  mapOutgoingWebhookAdminUpdated,
} from '../services/outgoing-webhook-admin-dto.js';
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
import { fireAdminAuditLog } from '../services/admin-audit-log.js';
import { lineAccountDbOptions } from '../services/line-account-at-rest-key.js';
import { denyUnlessWebhookSecretsAtRestKeyForWrites } from '../services/webhook-secret-at-rest-policy.js';
const outgoingWebhooksAdmin = new Hono<Env>();
outgoingWebhooksAdmin.get('/api/webhooks/outgoing', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const lineAccountId = c.req.query('lineAccountId');
    const q = validateScopedLineAccountQueryParam(scope, lineAccountId);
    if (!q.ok) {
      return c.json(jsonBodyForLineAccountScopeFailure(q), q.status);
    }
    let items = await getOutgoingWebhooks(c.env.DB, lineAccountDbOptions(c.env));
    if (lineAccountId) {
      items = items.filter((w) => (w.line_account_id ?? null) === lineAccountId);
    }

    return c.json({
      success: true,
      data: items.map(mapOutgoingWebhookAdminListItem),
    });
  } catch (err) {
    console.error('GET /api/webhooks/outgoing error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

outgoingWebhooksAdmin.post('/api/webhooks/outgoing', async (c) => {
  try {
    const deniedSecrets = denyUnlessWebhookSecretsAtRestKeyForWrites(c);
    if (deniedSecrets) return deniedSecrets;
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const body = await readJsonBodyWithLimit<{
      name: string;
      url: string;
      eventTypes: string[];
      secret?: string;
      lineAccountId?: string | null;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    if (!body.name || !body.url)
      return c.json({ success: false, error: 'name and url are required' }, 400);
    if (!body.secret?.trim()) {
      return c.json(
        {
          success: false,
          error:
            'secret is required (outgoing webhooks must sign payloads with HMAC so receivers can verify)',
        },
        400,
      );
    }

    const scoped = validateScopedLineAccountBody(scope, body.lineAccountId ?? null);
    if (!scoped.ok) {
      return c.json(jsonBodyForLineAccountScopeFailure(scoped), scoped.status);
    }
    if (scope.mode === 'restricted' && !scoped.lineAccountId) {
      return c.json({ success: false, error: 'lineAccountId is required for this principal' }, 400);
    }

    const outboundOk = await assertHttpsOutboundUrlResolvedSafe(body.url, fetch);
    if (!outboundOk.ok) {
      return c.json({ success: false, error: outboundOk.reason }, 400);
    }
    const item = await createOutgoingWebhook(
      c.env.DB,
      {
        name: body.name,
        url: body.url,
        eventTypes: body.eventTypes ?? [],
        secret: body.secret,
        lineAccountId: scoped.lineAccountId,
      },
      lineAccountDbOptions(c.env),
    );
    fireAdminAuditLog(c, {
      action: 'webhook.outgoing.create',
      resourceType: 'outgoing_webhook',
      resourceId: item.id,
      metadata: { name: body.name },
    });
    return c.json({ success: true, data: mapOutgoingWebhookAdminCreated(item) }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/webhooks/outgoing error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

outgoingWebhooksAdmin.put('/api/webhooks/outgoing/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const scopePut = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const existingWh = await getOutgoingWebhookById(c.env.DB, id, lineAccountDbOptions(c.env));
    if (!existingWh) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }
    if (!resourceLineAccountVisibleInScope(scopePut, existingWh.line_account_id)) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    if (body.secret !== undefined && body.secret !== null) {
      if (String(body.secret).trim() === '') {
        return c.json(
          {
            success: false,
            error:
              'secret cannot be empty; set a non-empty signing secret or omit the field to leave it unchanged',
          },
          400,
        );
      }
    }
    if (body.secret !== undefined && body.secret !== null) {
      const deniedSecrets = denyUnlessWebhookSecretsAtRestKeyForWrites(c);
      if (deniedSecrets) return deniedSecrets;
    }
    if (body.url !== undefined && body.url !== null && String(body.url).trim() !== '') {
      const outboundOk = await assertHttpsOutboundUrlResolvedSafe(String(body.url), fetch);
      if (!outboundOk.ok) {
        return c.json({ success: false, error: outboundOk.reason }, 400);
      }
    }

    const updates: Parameters<typeof updateOutgoingWebhook>[2] = {};
    if (typeof body.name === 'string') updates.name = body.name;
    if (body.url !== undefined && body.url !== null) updates.url = String(body.url);
    if (body.secret !== undefined && body.secret !== null) updates.secret = String(body.secret);
    const et = body.eventTypes ?? body.event_types;
    if (Array.isArray(et)) updates.eventTypes = et as string[];
    const ia = body.isActive ?? body.is_active;
    if (typeof ia === 'boolean') updates.isActive = ia;
    else if (ia === 0 || ia === 1) updates.isActive = Boolean(ia);
    if (body.lineAccountId !== undefined || body.line_account_id !== undefined) {
      const rawLa = body.lineAccountId ?? body.line_account_id;
      const scopedLa = validateScopedLineAccountBody(
        scopePut,
        rawLa === null ? null : typeof rawLa === 'string' ? rawLa : null,
      );
      if (!scopedLa.ok) {
        return c.json(jsonBodyForLineAccountScopeFailure(scopedLa), scopedLa.status);
      }
      updates.lineAccountId = scopedLa.lineAccountId;
    }

    await updateOutgoingWebhook(c.env.DB, id, updates, lineAccountDbOptions(c.env));
    const updated = await getOutgoingWebhookById(c.env.DB, id, lineAccountDbOptions(c.env));
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    fireAdminAuditLog(c, {
      action: 'webhook.outgoing.update',
      resourceType: 'outgoing_webhook',
      resourceId: id,
      metadata: { keys: Object.keys(updates) },
    });
    return c.json({ success: true, data: mapOutgoingWebhookAdminUpdated(updated) });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/webhooks/outgoing/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

outgoingWebhooksAdmin.delete('/api/webhooks/outgoing/:id', async (c) => {
  try {
    const scopeDel = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const whDel = await getOutgoingWebhookById(
      c.env.DB,
      c.req.param('id'),
      lineAccountDbOptions(c.env),
    );
    if (!whDel) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }
    if (!resourceLineAccountVisibleInScope(scopeDel, whDel.line_account_id)) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }
    const wid = c.req.param('id');
    await deleteOutgoingWebhook(c.env.DB, wid);
    fireAdminAuditLog(c, {
      action: 'webhook.outgoing.delete',
      resourceType: 'outgoing_webhook',
      resourceId: wid,
    });
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/webhooks/outgoing/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { outgoingWebhooksAdmin };
