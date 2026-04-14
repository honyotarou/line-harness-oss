import { Hono } from 'hono';
import {
  createOperator,
  deleteOperator,
  getOperatorById,
  getOperators,
  updateOperator,
} from '@line-crm/db';
import type { Env } from '../index.js';
import {
  resolveLineAccountScopeForRequest,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountBody,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';

const operators = new Hono<Env>();

operators.get('/api/operators', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const lineAccountId = c.req.query('lineAccountId') ?? null;
    const q = validateScopedLineAccountQueryParam(scope, lineAccountId ?? undefined);
    if (!q.ok) {
      return c.json({ success: false, error: q.error }, q.status);
    }
    const items = await getOperators(c.env.DB, { lineAccountId });
    return c.json({
      success: true,
      data: items.map((o) => ({
        id: o.id,
        name: o.name,
        email: o.email,
        role: o.role,
        lineAccountId: o.line_account_id ?? null,
        isActive: Boolean(o.is_active),
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/operators error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

operators.post('/api/operators', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const body = await readJsonBodyWithLimit<{
      name: string;
      email: string;
      role?: string;
      lineAccountId?: string | null;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    if (!body.name || !body.email)
      return c.json({ success: false, error: 'name and email are required' }, 400);

    const scoped = validateScopedLineAccountBody(scope, body.lineAccountId ?? null);
    if (!scoped.ok) {
      return c.json({ success: false, error: scoped.error }, scoped.status);
    }
    if (scope.mode === 'restricted' && !scoped.lineAccountId) {
      return c.json({ success: false, error: 'lineAccountId is required for this principal' }, 400);
    }

    const item = await createOperator(c.env.DB, {
      name: body.name,
      email: body.email,
      role: body.role,
      lineAccountId: scoped.lineAccountId,
    });
    return c.json(
      {
        success: true,
        data: {
          id: item.id,
          name: item.name,
          email: item.email,
          role: item.role,
          lineAccountId: item.line_account_id ?? null,
        },
      },
      201,
    );
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/operators error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

operators.put('/api/operators/:id', async (c) => {
  try {
    const scopePut = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const id = c.req.param('id');
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    const existing = await getOperatorById(c.env.DB, id);
    if (!existing) return c.json({ success: false, error: 'Not found' }, 404);
    if (!resourceLineAccountVisibleInScope(scopePut, existing.line_account_id ?? null)) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }

    if (body.lineAccountId !== undefined || body.line_account_id !== undefined) {
      const raw = body.lineAccountId ?? body.line_account_id;
      const scoped = validateScopedLineAccountBody(
        scopePut,
        raw === null || raw === undefined ? null : String(raw),
      );
      if (!scoped.ok) {
        return c.json({ success: false, error: scoped.error }, scoped.status);
      }
      body.lineAccountId = scoped.lineAccountId;
    }

    await updateOperator(c.env.DB, id, body as never);
    const updated = await getOperatorById(c.env.DB, id);
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);

    return c.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        lineAccountId: updated.line_account_id ?? null,
        isActive: Boolean(updated.is_active),
      },
    });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/operators/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

operators.delete('/api/operators/:id', async (c) => {
  try {
    const scopeDel = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const id = c.req.param('id');
    const existing = await getOperatorById(c.env.DB, id);
    if (!existing) return c.json({ success: true, data: null });
    if (!resourceLineAccountVisibleInScope(scopeDel, existing.line_account_id ?? null)) {
      return c.json({ success: true, data: null });
    }
    await deleteOperator(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/operators/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { operators };
