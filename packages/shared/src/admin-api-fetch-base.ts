import type { ClientApiBaseUrlResult } from './safe-api-base-url';
import {
  type ValidateClientApiBaseUrlOptions,
  validateClientApiBaseUrl,
} from './safe-api-base-url';

export type AdminApiFetchBaseResult =
  | { ok: true; fetchBase: string; origin: string }
  | { ok: false; reason: string };

/**
 * Validates the browser base URL used by {@link fetchApi} (may include an `/api/...` prefix for
 * same-origin Access proxy workers). LIFF / OAuth links still use {@link validateClientApiBaseUrl}
 * origin-only (`NEXT_PUBLIC_API_URL`).
 */
export function validateAdminApiFetchBase(
  raw: string,
  options?: ValidateClientApiBaseUrlOptions,
): AdminApiFetchBaseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: 'Admin API fetch base is empty' };
  }

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'Admin API fetch base is not a valid URL' };
  }

  if (u.username !== '' || u.password !== '') {
    return { ok: false, reason: 'Admin API fetch base must not include user credentials' };
  }

  if (u.search !== '' || u.hash !== '') {
    return { ok: false, reason: 'Admin API fetch base must not include a query or fragment' };
  }

  const host = u.hostname.toLowerCase();
  if (!host) {
    return { ok: false, reason: 'Admin API fetch base must include a hostname' };
  }

  if (u.protocol === 'http:') {
    const h = host;
    const local = h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
    if (!local) {
      return {
        ok: false,
        reason: 'Only https:// is allowed except for http://localhost (or 127.0.0.1 / ::1)',
      };
    }
  } else if (u.protocol !== 'https:') {
    return { ok: false, reason: 'Admin API fetch base must use http:// or https://' };
  }

  const allowPlaceholder = options?.allowPlaceholderTemplate !== false;
  if (!allowPlaceholder && host === 'your_subdomain.workers.dev') {
    return {
      ok: false,
      reason: 'Set a real Worker URL; the template hostname is not allowed in production',
    };
  }

  const path = u.pathname.replace(/\/+$/, '') || '/';
  const originOnly = `${u.origin}/`;
  const originCheck: ClientApiBaseUrlResult = validateClientApiBaseUrl(originOnly, options);
  if (!originCheck.ok) {
    return { ok: false, reason: originCheck.reason };
  }
  const origin = originCheck.normalizedOrigin;

  if (path === '/') {
    return { ok: true, fetchBase: origin, origin };
  }

  if (!path.startsWith('/api/')) {
    return {
      ok: false,
      reason: 'When a path is present it must start with /api/ (same-origin Access proxy prefix)',
    };
  }

  const segments = path.split('/').filter(Boolean);
  if (segments.some((s) => s === '..')) {
    return { ok: false, reason: 'Path must not contain .. segments' };
  }

  return { ok: true, fetchBase: `${origin}${path}`, origin };
}
