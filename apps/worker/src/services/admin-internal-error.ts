import type { Context } from 'hono';
import type { Env } from '../index.js';
import {
  isAdminPrincipalLineAccountsSchemaUnavailableError,
  type AdminPrincipalLineAccountsSchemaUnavailableError,
} from './admin-principal-line-accounts-schema-error.js';

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

export function jsonAdminPrincipalLineAccountsSchemaUnavailable(
  c: Context<Env>,
  err: AdminPrincipalLineAccountsSchemaUnavailableError,
  logLabel: string,
) {
  const requestId = getRequestCorrelationId(c);
  console.error(logLabel, { requestId, code: err.code }, err);
  c.header('X-Request-Correlation-Id', requestId);
  return c.json({ success: false, error: err.message, code: err.code, requestId }, 503);
}

/** Use in route `catch` blocks after body-read helpers so D1 migration gaps return 503 instead of opaque 500. */
export function respondToAdminRouteCaughtError(c: Context<Env>, err: unknown, logLabel: string) {
  if (isAdminPrincipalLineAccountsSchemaUnavailableError(err)) {
    return jsonAdminPrincipalLineAccountsSchemaUnavailable(c, err, logLabel);
  }
  return jsonInternalServerError(c, logLabel, err);
}
