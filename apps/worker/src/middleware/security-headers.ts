import type { Context, Next } from 'hono';
import { canonicalRequestPathname } from '../services/auth-paths.js';
import {
  buildWorkerHtmlContentSecurityPolicy,
  createWorkerHtmlCspNonce,
} from '../services/liff-html-csp.js';

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
  const nonce = createWorkerHtmlCspNonce();
  try {
    c.set('cspNonce', nonce as never);
  } catch {
    /* ignore */
  }
  try {
    await next();
  } finally {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (isHttpsRequest(c)) {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    const path = canonicalRequestPathname(new URL(c.req.url).pathname);
    if (path.startsWith('/api/')) {
      c.header('Cache-Control', 'no-store, private');
    }
    const ct = c.res?.headers?.get('content-type') ?? '';
    if (ct.includes('text/html')) {
      if (!c.res?.headers?.get('content-security-policy')) {
        c.header('Content-Security-Policy', buildWorkerHtmlContentSecurityPolicy(nonce));
      }
    }
  }
}
