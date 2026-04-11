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
 * Paths that skip admin Bearer/cookie auth.
 * Keep in sync with {@link authMiddleware}.
 */
export function isAuthExemptPath(pathname: string, method: string): boolean {
  const path = canonicalRequestPathname(pathname);
  const publicFormDefinitionGet = method === 'GET' && /^\/api\/forms\/[^/]+$/.test(path);
  const publicFormSubmitPost = method === 'POST' && /^\/api\/forms\/[^/]+\/submit$/.test(path);

  return (
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
 * `/api/auth/*` so a valid `Cf-Access-Jwt-Assertion` is required when Cloudflare Access is enforced
 * (closes direct `*.workers.dev` + API_KEY login bypass).
 */
export function isCloudflareAccessExemptPath(pathname: string, method: string): boolean {
  const path = canonicalRequestPathname(pathname);
  if (!isAuthExemptPath(path, method)) {
    return false;
  }
  const authApiRequiresCfJwt =
    (path === '/api/auth/login' && method === 'POST') ||
    (path === '/api/auth/session' && method === 'GET') ||
    (path === '/api/auth/logout' && method === 'POST');
  if (authApiRequiresCfJwt) {
    return false;
  }
  return true;
}
