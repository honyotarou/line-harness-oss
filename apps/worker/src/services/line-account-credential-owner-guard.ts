import type { Context } from 'hono';
import { getExplicitAdminPrincipalRole } from '@line-crm/db';
import type { Env } from '../index.js';
import {
  getCloudflareAccessEmailFromContext,
  isCloudflareAccessEnforced,
} from './cloudflare-access-principal.js';
import { wantsLineAccountCredentialRotation } from './line-account-secrets-write-guard.js';

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * When `REQUIRE_OWNER_DB_ROLE_FOR_LINE_CREDENTIALS=1` and Cloudflare Access is enforced,
 * principals with an **explicit** `admin` or `viewer` row in `admin_principal_roles` may not
 * create LINE accounts or rotate Messaging API credentials. Only `owner` (explicit) or **no row**
 * (legacy implicit full admin) may.
 */
export async function denyUnlessOwnerOrImplicitAdminForLineCredentials(
  c: Context<Env>,
  op: 'post' | 'put',
  body: Record<string, unknown>,
): Promise<Response | null> {
  if (!isTruthyEnvFlag(c.env.REQUIRE_OWNER_DB_ROLE_FOR_LINE_CREDENTIALS)) {
    return null;
  }
  if (!isCloudflareAccessEnforced(c.env)) {
    return null;
  }
  const email = getCloudflareAccessEmailFromContext(c);
  if (!email) {
    return null;
  }

  const touchesCredentials = op === 'post' || wantsLineAccountCredentialRotation(body);
  if (!touchesCredentials) {
    return null;
  }

  const explicit = await getExplicitAdminPrincipalRole(c.env.DB, email);
  if (explicit === null || explicit === 'owner') {
    return null;
  }

  return c.json(
    {
      success: false,
      error:
        'Forbidden: LINE Messaging API credentials may only be provisioned or rotated by principals with role owner in admin_principal_roles (principals with no D1 row keep legacy full admin for credentials)',
    },
    403,
  );
}
