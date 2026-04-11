import type { Context, Next } from 'hono';
import { resolveAdminPrincipalAccess } from '@line-crm/db';
import type { Env } from '../index.js';
import { canonicalRequestPathname, isAuthExemptPath } from '../services/auth-paths.js';
import {
  CLOUDFLARE_ACCESS_EMAIL_REQUIRED_ERROR,
  getCloudflareAccessEmailFromContext,
  isCloudflareAccessEnforced,
} from '../services/cloudflare-access-principal.js';
import { isStateChangingAdminMethod } from '../services/admin-browser-csrf.js';

function isRequireAdminPrincipalAllowlist(env: {
  REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST?: string;
}): boolean {
  const v = env.REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function isAdminPrincipalRolesPath(pathname: string): boolean {
  return (
    pathname === '/api/admin/principal-roles' || pathname.startsWith('/api/admin/principal-roles/')
  );
}

/** Mutations a read-only principal must still perform to use the admin UI. */
function isViewerAllowedAdminMutation(pathname: string, method: string): boolean {
  const m = method.toUpperCase();
  if (m !== 'POST') {
    return false;
  }
  return pathname === '/api/auth/login' || pathname === '/api/auth/logout';
}

/**
 * When Cloudflare Access is enforced, JWT must carry a valid `email` (enforced in cloudflareAccessMiddleware).
 * Optional D1 row `admin_principal_roles` can set `viewer` for read-only API access.
 * When `REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST` is set, only listed emails may use the API (except bootstrap on empty table).
 */
export async function adminRbacMiddleware(c: Context<Env>, next: Next): Promise<Response | void> {
  const url = new URL(c.req.url);
  const pathname = canonicalRequestPathname(url.pathname);
  const method = c.req.method;

  if (isAuthExemptPath(pathname, method)) {
    return next();
  }

  if (!isCloudflareAccessEnforced(c.env)) {
    return next();
  }

  const email = getCloudflareAccessEmailFromContext(c);
  if (!email) {
    return c.json({ success: false, error: CLOUDFLARE_ACCESS_EMAIL_REQUIRED_ERROR }, 403);
  }

  const strict = isRequireAdminPrincipalAllowlist(c.env);
  const access = await resolveAdminPrincipalAccess(c.env.DB, email, { strictAllowlist: strict });

  if (access.kind === 'deny_unlisted') {
    return c.json(
      {
        success: false,
        error:
          'Forbidden: principal email is not listed in admin_principal_roles (enable only after seeding rows, or disable REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST)',
      },
      403,
    );
  }

  if (access.kind === 'bootstrap_empty_table') {
    if (isAdminPrincipalRolesPath(pathname)) {
      return next();
    }
    return c.json(
      {
        success: false,
        error:
          'Forbidden: admin_principal_roles is empty. Add at least one row via PUT /api/admin/principal-roles before using other APIs (REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST is enabled).',
      },
      403,
    );
  }

  const role = access.role;
  if (role !== 'viewer') {
    return next();
  }

  if (!isStateChangingAdminMethod(method)) {
    return next();
  }

  if (isViewerAllowedAdminMutation(pathname, method)) {
    return next();
  }

  return c.json({ success: false, error: 'Forbidden: read-only role' }, 403);
}
