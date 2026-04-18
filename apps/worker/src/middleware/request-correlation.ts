import type { Context, Next } from 'hono';
import type { Env } from '../index.js';

/**
 * Assigns a stable per-request id for logs and opaque 500 JSON (`requestId`).
 * Prefers `CF-Ray` on the edge; falls back to client `X-Request-Correlation-Id`, then UUID.
 */
export async function requestCorrelationMiddleware(c: Context<Env>, next: Next): Promise<void> {
  const ray = c.req.header('CF-Ray')?.trim();
  const headerId = c.req.header('X-Request-Correlation-Id')?.trim();
  const id =
    ray && ray.length > 0 ? ray : headerId && headerId.length > 0 ? headerId : crypto.randomUUID();
  c.set('requestCorrelationId', id);
  await next();
}
