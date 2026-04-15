import { ADMIN_BROWSER_CLIENT_HEADER, ADMIN_BROWSER_CLIENT_HEADER_VALUE } from '@line-crm/shared';
import { parseBearerAuthorization } from './bearer-authorization.js';
import { isStrictDeployedHttpsSurface } from './deployed-security-defaults.js';
import { timingSafeEqualUtf8 } from './timing-safe-equal.js';

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export const adminBrowserClientHeaderName = ADMIN_BROWSER_CLIENT_HEADER;
export const adminBrowserClientHeaderValue = ADMIN_BROWSER_CLIENT_HEADER_VALUE;

export function isStateChangingAdminMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
}

/**
 * Cookie-only admin auth is vulnerable to cross-site form POSTs (SameSite=None cookies).
 * Require a custom header that simple cross-origin HTML forms cannot set without a preflight
 * that fails when Origin is not allowlisted.
 */
export function shouldRequireAdminBrowserClientHeader(
  method: string,
  authorizationHeader: string | undefined,
  sessionCookieToken: string | null,
): boolean {
  if (!isStateChangingAdminMethod(method)) {
    return false;
  }
  if (!sessionCookieToken) {
    return false;
  }
  if (parseBearerAuthorization(authorizationHeader)) {
    return false;
  }
  return true;
}

export async function hasValidAdminBrowserClientHeader(
  req: {
    header: (n: string) => string | undefined;
  },
  env?: {
    ADMIN_BROWSER_CLIENT_TOKEN?: string;
    WORKER_URL?: string;
    ALLOW_DEFAULT_ADMIN_BROWSER_CLIENT?: string;
    RELAX_DEPLOYED_SECURITY_DEFAULTS?: string;
    RELAX_DEPLOYED_SECURITY_CONFIRM?: string;
  },
): Promise<boolean> {
  const v = req.header(adminBrowserClientHeaderName)?.trim() ?? '';
  const expected = env?.ADMIN_BROWSER_CLIENT_TOKEN?.trim();
  if (expected && expected.length > 0) {
    return timingSafeEqualUtf8(v, expected);
  }
  if (
    isStrictDeployedHttpsSurface(env ?? {}) &&
    !isTruthyEnvFlag(env?.ALLOW_DEFAULT_ADMIN_BROWSER_CLIENT)
  ) {
    return false;
  }
  return v === adminBrowserClientHeaderValue;
}
