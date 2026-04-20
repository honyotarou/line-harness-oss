import type { Context } from 'hono';
import type { Env } from '../index.js';
import { sanitizeAccessBootstrapReturnTo } from './auth-access-bootstrap-return-to.js';

/** `GET /api/auth/access-bootstrap` — no admin session; validated `returnTo` redirect after Access. */
export function respondAuthAccessBootstrapGet(c: Context<Env>): Response {
  return c.redirect(sanitizeAccessBootstrapReturnTo(c.req.query('returnTo') ?? undefined), 302);
}
