import { ADMIN_BROWSER_CLIENT_HEADER, ADMIN_BROWSER_CLIENT_HEADER_VALUE } from '@line-crm/shared';
import { parseBearerAuthorization } from './bearer-authorization.js';

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

export function hasValidAdminBrowserClientHeader(req: {
  header: (n: string) => string | undefined;
}): boolean {
  const v = req.header(adminBrowserClientHeaderName)?.trim();
  return v === adminBrowserClientHeaderValue;
}
