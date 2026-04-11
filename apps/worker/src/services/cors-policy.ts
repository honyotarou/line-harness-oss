import { ADMIN_BROWSER_CLIENT_HEADER } from '@line-crm/shared';
import {
  buildAllowedOrigins,
  isAllowedOrigin as isAllowedOriginShared,
  normalizeOrigin,
  type AllowedOriginsEnv,
} from '@line-crm/shared';

type CorsEnv = AllowedOriginsEnv;

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
