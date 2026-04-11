import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import {
  deleteAdminPrincipalRole,
  getAdminPrincipalRole,
  listAdminPrincipalRoles,
  upsertAdminPrincipalRole,
  type AdminPrincipalRole,
} from '@line-crm/db';
import type { Env } from '../index.js';
import {
  CLOUDFLARE_ACCESS_EMAIL_REQUIRED_ERROR,
  getCloudflareAccessEmailFromContext,
  isCloudflareAccessEnforced,
} from '../services/cloudflare-access-principal.js';
import { readJsonBodyWithLimit, jsonBodyReadErrorResponse } from '../services/request-body.js';

const BODY_LIMIT = 4 * 1024;

const routes = new Hono<Env>();

/** Blocks viewer principals from managing role assignments (GET/PUT/DELETE). */
async function requireNotViewerPrincipal(c: Context<Env>, next: Next): Promise<Response | void> {
  if (!isCloudflareAccessEnforced(c.env)) {
    return next();
  }
  const email = getCloudflareAccessEmailFromContext(c);
  if (!email) {
    return c.json({ success: false, error: CLOUDFLARE_ACCESS_EMAIL_REQUIRED_ERROR }, 403);
  }
  const role = await getAdminPrincipalRole(c.env.DB, email);
  if (role === 'viewer') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  return next();
}

routes.use('*', requireNotViewerPrincipal);

function isValidPrincipalEmail(raw: string): boolean {
  const s = raw.trim();
  return s.length > 0 && s.length <= 320 && s.includes('@');
}

function parseRole(raw: unknown): AdminPrincipalRole | null {
  if (raw === 'admin' || raw === 'viewer') {
    return raw;
  }
  return null;
}

routes.get('/api/admin/principal-roles', async (c) => {
  try {
    const data = await listAdminPrincipalRoles(c.env.DB);
    return c.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/admin/principal-roles error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

routes.put('/api/admin/principal-roles', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(c.req.raw, BODY_LIMIT);
    const email = typeof body.email === 'string' ? body.email : '';
    const role = parseRole(body.role);
    if (!isValidPrincipalEmail(email)) {
      return c.json({ success: false, error: 'Invalid email' }, 400);
    }
    if (!role) {
      return c.json({ success: false, error: 'role must be admin or viewer' }, 400);
    }
    await upsertAdminPrincipalRole(c.env.DB, email, role);
    return c.json({ success: true, data: null });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/admin/principal-roles error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

routes.delete('/api/admin/principal-roles/:email', async (c) => {
  try {
    const raw = c.req.param('email');
    const email = raw ? decodeURIComponent(raw) : '';
    if (!isValidPrincipalEmail(email)) {
      return c.json({ success: false, error: 'Invalid email' }, 400);
    }
    const removed = await deleteAdminPrincipalRole(c.env.DB, email);
    return c.json({ success: true, data: { removed } });
  } catch (err) {
    console.error('DELETE /api/admin/principal-roles/:email error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { routes as adminPrincipalRolesRoutes };
