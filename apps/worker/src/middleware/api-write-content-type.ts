import type { Context, Next } from 'hono';
import type { Env } from '../index.js';
import { allowsApiWriteContentType } from '../services/api-write-content-type.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Require JSON-family `Content-Type` on mutating `/api/*` requests (see {@link allowsApiWriteContentType}).
 * Skips `OPTIONS` (CORS preflight). Does not apply outside `/api`.
 */
export async function apiWriteContentTypeMiddleware(
  c: Context<Env>,
  next: Next,
): Promise<Response | void> {
  const method = c.req.method;
  if (method === 'OPTIONS' || !MUTATING.has(method)) {
    return next();
  }

  const pathname = new URL(c.req.url).pathname;
  if (!pathname.startsWith('/api')) {
    return next();
  }

  const ct = c.req.header('content-type');
  if (!allowsApiWriteContentType(pathname, method, ct)) {
    return c.json(
      {
        success: false,
        error: 'Content-Type must be application/json (or an application/*+json subtype)',
      },
      415,
    );
  }

  return next();
}
