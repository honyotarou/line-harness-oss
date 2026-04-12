import { ADMIN_BROWSER_CLIENT_HEADER } from '@line-crm/shared';
import {
  buildAllowedOrigins,
  isAllowedOrigin as isAllowedOriginShared,
  normalizeOrigin,
  type AllowedOriginsEnv,
} from '@line-crm/shared';
import { canonicalRequestPathname } from './auth-paths.js';

type CorsEnv = AllowedOriginsEnv;
const SHARED_LINE_WEB_ORIGINS = new Set([
  'https://line.me',
  'https://access.line.me',
  'https://liff.line.me',
]);

/** Browser may send `Origin: null` (sandboxed contexts); never treat as a real https origin. */
export const ACCESS_CONTROL_ALLOW_HEADERS = [
  'Authorization',
  'Content-Type',
  'Cf-Access-Jwt-Assertion',
  'CF-Access-Jwt-Assertion',
  ADMIN_BROWSER_CLIENT_HEADER,
].join(', ');

export { buildAllowedOrigins, normalizeOrigin };

export function isAllowedOrigin(
  origin: string | undefined | null,
  allowedOrigins: Iterable<string>,
): boolean {
  return isAllowedOriginShared(origin, allowedOrigins);
}

/**
 * Browsers send `Origin` on cross-site requests; curl and most non-browser clients omit it.
 * CORS response headers are only meaningful for browsers, so we skip the middleware branch when absent.
 */
export function shouldApplyCorsForOriginHeader(origin: string | null | undefined): boolean {
  return typeof origin === 'string' && origin.trim().length > 0;
}

/**
 * Official LINE web hosts are shared origins, not per-app origins.
 * Treat them as untrusted for generic admin/browser CORS and only allow the explicit public LIFF paths.
 */
export function isSharedLineHostedOrigin(origin: string | null | undefined): boolean {
  const normalized = normalizeOrigin(origin);
  return normalized ? SHARED_LINE_WEB_ORIGINS.has(normalized) : false;
}

/**
 * Shared LINE origins may call only public LIFF/browser routes. Do not expose generic admin/API CORS here.
 */
export function isAllowedSharedLineCorsPath(pathname: string, method: string): boolean {
  const path = canonicalRequestPathname(pathname);
  const upperMethod = method.toUpperCase();
  const publicFormDefinitionGet = upperMethod === 'GET' && /^\/api\/forms\/[^/]+$/.test(path);
  const publicFormSubmitPost = upperMethod === 'POST' && /^\/api\/forms\/[^/]+\/submit$/.test(path);

  return (
    path.startsWith('/api/liff/') ||
    publicFormDefinitionGet ||
    publicFormSubmitPost ||
    (upperMethod === 'POST' && path === '/api/affiliates/click')
  );
}
