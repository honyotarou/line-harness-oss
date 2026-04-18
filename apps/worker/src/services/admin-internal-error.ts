import type { Context } from 'hono';
import type { Env } from '../index.js';

export function getRequestCorrelationId(c: Context<Env>): string {
  const existing = c.get('requestCorrelationId');
  if (typeof existing === 'string' && existing.length > 0) {
    return existing;
  }
  const ray = c.req.header('CF-Ray')?.trim();
  if (ray && ray.length > 0) {
    c.set('requestCorrelationId', ray);
    return ray;
  }
  const headerId = c.req.header('X-Request-Correlation-Id')?.trim();
  if (headerId && headerId.length > 0) {
    c.set('requestCorrelationId', headerId);
    return headerId;
  }
  const id = crypto.randomUUID();
  c.set('requestCorrelationId', id);
  return id;
}

export function jsonInternalServerError(c: Context<Env>, logLabel: string, err: unknown) {
  const requestId = getRequestCorrelationId(c);
  console.error(logLabel, { requestId }, err);
  c.header('X-Request-Correlation-Id', requestId);
  return c.json({ success: false, error: 'Internal server error', requestId }, 500);
}
