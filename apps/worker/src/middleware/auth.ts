import type { Context, Next } from 'hono';
import type { Env } from '../index.js';
import {
  hasValidAdminBrowserClientHeader,
  shouldRequireAdminBrowserClientHeader,
} from '../services/admin-browser-csrf.js';
import { isAuthExemptPath } from '../services/auth-paths.js';
import {
  isValidAdminAuthToken,
  readAdminSessionCookie,
  resolveAdminSessionSecret,
} from '../services/admin-session.js';
import { parseBearerAuthorization } from '../services/bearer-authorization.js';

export async function authMiddleware(c: Context<Env>, next: Next): Promise<Response | void> {
  const path = new URL(c.req.url).pathname;
  const method = c.req.method;

  if (isAuthExemptPath(path, method)) {
    return next();
  }

  const authz = c.req.header('Authorization');
  const cookieTok = readAdminSessionCookie(c);
  const token = parseBearerAuthorization(authz) ?? cookieTok;
  if (!token) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  if (
    shouldRequireAdminBrowserClientHeader(method, authz, cookieTok) &&
    !hasValidAdminBrowserClientHeader(c.req)
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const sessionSecret = resolveAdminSessionSecret(c.env);
  if (!sessionSecret) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  const valid = await isValidAdminAuthToken(sessionSecret, token, c.env.DB);
  if (!valid) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  return next();
}
