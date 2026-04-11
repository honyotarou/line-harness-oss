/**
 * Paths that skip admin Bearer/cookie auth.
 * Keep in sync with {@link authMiddleware}.
 */
export function isAuthExemptPath(pathname: string, method: string): boolean {
  const publicFormDefinitionGet = method === 'GET' && /^\/api\/forms\/[^/]+$/.test(pathname);
  const publicFormSubmitPost = method === 'POST' && /^\/api\/forms\/[^/]+\/submit$/.test(pathname);

  return (
    pathname === '/webhook' ||
    pathname === '/docs' ||
    pathname === '/openapi.json' ||
    pathname === '/api/affiliates/click' ||
    pathname.startsWith('/t/') ||
    pathname.startsWith('/r/') ||
    pathname.startsWith('/api/liff/') ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/session' ||
    pathname === '/api/auth/logout' ||
    pathname.startsWith('/auth/') ||
    pathname === '/api/integrations/stripe/webhook' ||
    /^\/api\/webhooks\/incoming\/[^/]+\/receive$/.test(pathname) ||
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
  if (!isAuthExemptPath(pathname, method)) {
    return false;
  }
  const authApiRequiresCfJwt =
    (pathname === '/api/auth/login' && method === 'POST') ||
    (pathname === '/api/auth/session' && method === 'GET') ||
    (pathname === '/api/auth/logout' && method === 'POST');
  if (authApiRequiresCfJwt) {
    return false;
  }
  return true;
}
