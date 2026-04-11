import type { Context, Next } from 'hono';

function isHttpsRequest(c: Context): boolean {
  const url = new URL(c.req.url);
  if (url.protocol === 'https:') {
    return true;
  }
  const xf = c.req.header('X-Forwarded-Proto')?.split(',')[0]?.trim().toLowerCase();
  return xf === 'https';
}

/**
 * Defense-in-depth for API clients: nosniff everywhere; avoid caching authenticated JSON under `/api/`.
 * HSTS only on HTTPS (including behind TLS-terminating proxies that set X-Forwarded-Proto).
 */
export async function securityHeadersMiddleware(c: Context, next: Next): Promise<void> {
  try {
    await next();
  } finally {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isHttpsRequest(c)) {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    const path = new URL(c.req.url).pathname;
    if (path.startsWith('/api/')) {
      c.header('Cache-Control', 'no-store, private');
    }
  }
}
