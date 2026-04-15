import { Hono } from 'hono';
import {
  createIncomingWebhook,
  deleteIncomingWebhook,
  getIncomingWebhookById,
  getIncomingWebhooks,
  updateIncomingWebhook,
} from '@line-crm/db';
import type { Env } from '../index.js';
import { maskSigningSecretForList } from '../services/signing-secret-display.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import {
  resolveLineAccountScopeForRequest,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountBody,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';
import { fireAdminAuditLog } from '../services/admin-audit-log.js';
import { lineAccountDbOptions } from '../services/line-account-at-rest-key.js';
import { denyUnlessWebhookSecretsAtRestKeyForWrites } from '../services/webhook-secret-at-rest-policy.js';

function buildIncomingWebhookUpdates(body: Record<string, unknown>): Partial<{
  name: string;
  sourceType: string;
  secret: string;
  lineAccountId: string | null;
  isActive: boolean;
}> {
  const updates: Partial<{
    name: string;
    sourceType: string;
    secret: string;
    lineAccountId: string | null;
    isActive: boolean;
  }> = {};
  if (typeof body.name === 'string') updates.name = body.name;
  const st = body.sourceType ?? body.source_type;
  if (typeof st === 'string') updates.sourceType = st;
  if (body.secret !== undefined && body.secret !== null) {
    updates.secret = String(body.secret);
  }
  const lai = body.lineAccountId ?? body.line_account_id;
  if (lai === null) updates.lineAccountId = null;
  else if (typeof lai === 'string') updates.lineAccountId = lai;
  const ia = body.isActive ?? body.is_active;
  if (typeof ia === 'boolean') updates.isActive = ia;
  else if (ia === 0 || ia === 1) updates.isActive = Boolean(ia);
  return updates;
}

const incomingWebhooksAdmin = new Hono<Env>();

incomingWebhooksAdmin.get('/api/webhooks/incoming', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const lineAccountId = c.req.query('lineAccountId') ?? null;
    const q = validateScopedLineAccountQueryParam(scope, lineAccountId ?? undefined);
    if (!q.ok) {
      return c.json({ success: false, error: q.error }, q.status);
    }
    const items = await getIncomingWebhooks(
      c.env.DB,
      { lineAccountId },
      lineAccountDbOptions(c.env),
    );
    return c.json({
      success: true,
      data: items.map((w) => ({
        id: w.id,
        name: w.name,
        sourceType: w.source_type,
        secret: maskSigningSecretForList(w.secret),
        lineAccountId: w.line_account_id ?? null,
        isActive: Boolean(w.is_active),
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/webhooks/incoming error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

incomingWebhooksAdmin.post('/api/webhooks/incoming', async (c) => {
  try {
    const deniedSecrets = denyUnlessWebhookSecretsAtRestKeyForWrites(c);
    if (deniedSecrets) return deniedSecrets;
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const body = await readJsonBodyWithLimit<{
      name: string;
      sourceType?: string;
      secret?: string;
      lineAccountId?: string | null;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);
    if (!body.secret?.trim()) {
      return c.json(
        {
          success: false,
          error: 'secret is required (incoming webhooks must verify HMAC signatures)',
        },
        400,
      );
    }

    const scoped = validateScopedLineAccountBody(scope, body.lineAccountId ?? null);
    if (!scoped.ok) {
      return c.json({ success: false, error: scoped.error }, scoped.status);
    }

    const item = await createIncomingWebhook(
      c.env.DB,
      {
        name: body.name,
        sourceType: body.sourceType,
        secret: body.secret,
        lineAccountId: scoped.lineAccountId,
      },
      lineAccountDbOptions(c.env),
    );
    fireAdminAuditLog(c, {
      action: 'webhook.incoming.create',
      resourceType: 'incoming_webhook',
      resourceId: item.id,
      metadata: { name: body.name, sourceType: body.sourceType ?? 'custom' },
    });
    return c.json(
      {
        success: true,
        data: {
          id: item.id,
          name: item.name,
          sourceType: item.source_type,
          lineAccountId: item.line_account_id ?? null,
          isActive: Boolean(item.is_active),
          createdAt: item.created_at,
        },
      },
      201,
    );
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/webhooks/incoming error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

incomingWebhooksAdmin.put('/api/webhooks/incoming/:id', async (c) => {
  try {
    const scopePut = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const id = c.req.param('id');
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

    const existing = await getIncomingWebhookById(c.env.DB, id, lineAccountDbOptions(c.env));
    if (!existing) return c.json({ success: false, error: 'Not found' }, 404);
    if (!resourceLineAccountVisibleInScope(scopePut, existing.line_account_id ?? null)) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }

    const updates = buildIncomingWebhookUpdates(body);
    if (updates.secret !== undefined) {
      const deniedSecrets = denyUnlessWebhookSecretsAtRestKeyForWrites(c);
      if (deniedSecrets) return deniedSecrets;
    }
    if (updates.lineAccountId !== undefined) {
      const scoped = validateScopedLineAccountBody(scopePut, updates.lineAccountId);
      if (!scoped.ok) {
        return c.json({ success: false, error: scoped.error }, scoped.status);
      }
      updates.lineAccountId = scoped.lineAccountId;
    }

    await updateIncomingWebhook(c.env.DB, id, updates, lineAccountDbOptions(c.env));
    const updated = await getIncomingWebhookById(c.env.DB, id, lineAccountDbOptions(c.env));
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    fireAdminAuditLog(c, {
      action: 'webhook.incoming.update',
      resourceType: 'incoming_webhook',
      resourceId: id,
      metadata: { keys: Object.keys(updates) },
    });
    return c.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        sourceType: updated.source_type,
        lineAccountId: updated.line_account_id ?? null,
        isActive: Boolean(updated.is_active),
      },
    });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/webhooks/incoming/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

incomingWebhooksAdmin.delete('/api/webhooks/incoming/:id', async (c) => {
  try {
    const scopeDel = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const id = c.req.param('id');
    const existing = await getIncomingWebhookById(c.env.DB, id, lineAccountDbOptions(c.env));
    if (!existing) return c.json({ success: true, data: null });
    if (!resourceLineAccountVisibleInScope(scopeDel, existing.line_account_id ?? null)) {
      return c.json({ success: true, data: null });
    }
    await deleteIncomingWebhook(c.env.DB, id);
    fireAdminAuditLog(c, {
      action: 'webhook.incoming.delete',
      resourceType: 'incoming_webhook',
      resourceId: id,
    });
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/webhooks/incoming/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { incomingWebhooksAdmin };
