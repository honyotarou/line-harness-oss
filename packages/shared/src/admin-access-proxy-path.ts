/**
 * Path policy for the optional Cloudflare Worker that proxies browser-same-origin
 * `/api/lh-upstream/*` → upstream Worker API (`/api/*`) with Access service credentials.
 */

/** Strip configured prefix; return null if pathname does not start with prefix. */
export function stripAdminAccessProxyPrefix(pathname: string, prefix: string): string | null {
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const pre = (prefix.startsWith('/') ? prefix : `/${prefix}`).replace(/\/+$/, '');
  if (!pre || pre === '/') {
    return null;
  }
  if (p === pre) {
    return '/';
  }
  if (!p.startsWith(`${pre}/`)) {
    return null;
  }
  const rest = p.slice(pre.length) || '/';
  return rest.startsWith('/') ? rest : `/${rest}`;
}

/**
 * Only forward paths that match the line-crm Worker admin API surface (`/api/...`).
 */
export function isEligibleWorkerAdminProxyTargetPath(pathname: string): boolean {
  let p: string;
  try {
    p = new URL(pathname, 'https://canonical.invalid').pathname;
  } catch {
    return false;
  }
  if (!p.startsWith('/')) {
    p = `/${p}`;
  }
  const normalized = p.replace(/\/{2,}/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((s) => s === '..')) {
    return false;
  }
  return normalized.startsWith('/api/') || normalized === '/api';
}
