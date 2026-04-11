/**
 * Validates browser-configured Worker API origins (NEXT_PUBLIC_API_URL, VITE_API_URL, lh-api-base meta).
 * Mitigates misconfiguration / tampering that would send tokens to an unexpected host.
 */

export type ClientApiBaseUrlResult =
  | { ok: true; normalizedOrigin: string }
  | { ok: false; reason: string };

export type ValidateClientApiBaseUrlOptions = {
  /**
   * When false, reject the repository template host `your_subdomain.workers.dev`.
   * Use false in production builds.
   */
  allowPlaceholderTemplate?: boolean;
};

const PLACEHOLDER_HOST = 'your_subdomain.workers.dev';

function isLocalHttpHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

/**
 * @param raw - Trimmed or untrimmed absolute URL (origin only; path must be `/` or empty).
 */
export function validateClientApiBaseUrl(
  raw: string,
  options?: ValidateClientApiBaseUrlOptions,
): ClientApiBaseUrlResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: 'API base URL is empty' };
  }

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'API base URL is not a valid URL' };
  }

  if (u.username !== '' || u.password !== '') {
    return { ok: false, reason: 'API base URL must not include user credentials' };
  }

  if (u.search !== '' || u.hash !== '') {
    return { ok: false, reason: 'API base URL must not include a query or fragment' };
  }

  const path = u.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/') {
    return { ok: false, reason: 'API base URL must be an origin only (no path beyond /)' };
  }

  const host = u.hostname.toLowerCase();
  if (!host) {
    return { ok: false, reason: 'API base URL must include a hostname' };
  }

  if (u.protocol === 'http:') {
    if (!isLocalHttpHost(host)) {
      return {
        ok: false,
        reason: 'Only https:// is allowed except for http://localhost (or 127.0.0.1 / ::1)',
      };
    }
  } else if (u.protocol !== 'https:') {
    return { ok: false, reason: 'API base URL must use http:// or https://' };
  }

  const allowPlaceholder = options?.allowPlaceholderTemplate !== false;
  if (!allowPlaceholder && host === PLACEHOLDER_HOST) {
    return {
      ok: false,
      reason: 'Set a real Worker URL; the template hostname is not allowed in production',
    };
  }

  return { ok: true, normalizedOrigin: u.origin };
}
