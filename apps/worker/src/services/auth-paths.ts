import {
  isEligibleWorkerAdminProxyTargetPath,
  stripAdminAccessProxyPrefix,
} from '@line-crm/shared';

/**
 * WHATWG-normalize an HTTP path (collapse `.` / `..`, etc.) so `startsWith('/api/liff/')` cannot be
 * bypassed with `/api/liff/../…` if a caller ever passes a non-normalized pathname.
 */
export function canonicalRequestPathname(pathname: string): string {
  if (!pathname || pathname[0] !== '/') {
    return pathname;
  }
  try {
    return new URL(pathname, 'https://canonical.invalid').pathname;
  } catch {
    return pathname;
  }
}

/**
 * Default same-origin admin BFF prefix (browser `NEXT_PUBLIC_ADMIN_BROWSER_API_BASE`).
 * Matches the default in `middleware/admin-bff-inbound-path-rewrite.ts` when unset.
 */
const DEFAULT_ADMIN_BFF_INBOUND_PATH_PREFIX = '/api/lh-upstream';

/**
 * Collapse `..` then strip the default `/api/lh-upstream` prefix when the remainder is an eligible
 * `/api/...` path. Ensures policy helpers see `/api/auth/session` even if the inbound URL still
 * carries the BFF prefix (rewrite middleware absent or bypassed).
 */
export function logicalAdminApiPathnameForPolicy(pathname: string): string {
  const canonical = canonicalRequestPathname(pathname);
  const stripped = stripAdminAccessProxyPrefix(canonical, DEFAULT_ADMIN_BFF_INBOUND_PATH_PREFIX);
  if (stripped !== null && isEligibleWorkerAdminProxyTargetPath(stripped)) {
    return stripped;
  }
  return canonical;
}

/** Optional Worker binding: when set to empty string, inbound BFF logical strip is disabled. */
export type AdminInboundBffPolicyBindings = {
  ADMIN_INBOUND_BFF_PATH_PREFIX?: string;
};

function isInboundBffLogicalStripDisabled(bindings?: AdminInboundBffPolicyBindings): boolean {
  const raw = bindings?.ADMIN_INBOUND_BFF_PATH_PREFIX;
  return raw !== undefined && raw.trim() === '';
}

/**
 * Pathname used for **bearer/cookie auth skip** checks. Honors {@link AdminInboundBffPolicyBindings}
 * so an explicit empty `ADMIN_INBOUND_BFF_PATH_PREFIX` matches “inbound rewrite disabled” and does
 * not normalize away `/api/lh-upstream/...` (except {@link logicalAdminApiPathnameForPolicy} is still
 * used for `GET /api/auth/access-bootstrap` so BFF-prefixed bootstrap never dies in `authMiddleware`).
 */
export function policyAdminRequestPathname(
  pathname: string,
  bindings?: AdminInboundBffPolicyBindings,
): string {
  if (isInboundBffLogicalStripDisabled(bindings)) {
    return canonicalRequestPathname(pathname);
  }
  return logicalAdminApiPathnameForPolicy(pathname);
}

/**
 * Paths that skip admin Bearer/cookie auth.
 * Keep in sync with {@link authMiddleware}.
 */
export function isAuthExemptPath(
  pathname: string,
  method: string,
  bindings?: AdminInboundBffPolicyBindings,
): boolean {
  if (
    method === 'GET' &&
    logicalAdminApiPathnameForPolicy(pathname) === '/api/auth/access-bootstrap'
  ) {
    return true;
  }
  const path = policyAdminRequestPathname(pathname, bindings);
  const publicFormDefinitionGet = method === 'GET' && /^\/api\/forms\/[^/]+$/.test(path);
  const publicFormSubmitPost = method === 'POST' && /^\/api\/forms\/[^/]+\/submit$/.test(path);

  return (
    (method === 'GET' && path === '/') ||
    (method === 'GET' && path === '/favicon.ico') ||
    path === '/webhook' ||
    path === '/docs' ||
    path === '/openapi.json' ||
    path === '/api/affiliates/click' ||
    path.startsWith('/t/') ||
    path.startsWith('/r/') ||
    path.startsWith('/api/liff/') ||
    path === '/api/auth/login' ||
    path === '/api/auth/session' ||
    path === '/api/auth/logout' ||
    path.startsWith('/auth/') ||
    path === '/api/integrations/stripe/webhook' ||
    /^\/api\/webhooks\/incoming\/[^/]+\/receive$/.test(path) ||
    publicFormSubmitPost ||
    publicFormDefinitionGet
  );
}

/**
 * Subset of {@link isAuthExemptPath}: still skips webhook/LIFF/public forms, but **does not** skip
 * `/api/auth/*` or **GET /** so a valid `Cf-Access-Jwt-Assertion` is required when Cloudflare Access is enforced
 * (closes direct `*.workers.dev` + API_KEY login bypass). GET `/` skips admin session only so document
 * navigations to the API host return 404 instead of a misleading 401.
 */
export function isCloudflareAccessExemptPath(
  pathname: string,
  method: string,
  bindings?: AdminInboundBffPolicyBindings,
): boolean {
  if (!isAuthExemptPath(pathname, method, bindings)) {
    return false;
  }
  const logicalForJwt = logicalAdminApiPathnameForPolicy(pathname);
  const authApiRequiresCfJwt =
    (logicalForJwt === '/' && method === 'GET') ||
    (logicalForJwt === '/api/auth/login' && method === 'POST') ||
    (logicalForJwt === '/api/auth/session' && method === 'GET') ||
    (logicalForJwt === '/api/auth/access-bootstrap' && method === 'GET') ||
    (logicalForJwt === '/api/auth/logout' && method === 'POST');
  if (authApiRequiresCfJwt) {
    return false;
  }
  return true;
}
