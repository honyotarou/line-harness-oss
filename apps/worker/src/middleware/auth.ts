import type { Context, Next } from 'hono';
import type { Env } from '../index.js';
import { isAuthExemptPath } from '../services/auth-paths.js';
import { isValidAdminAuthToken, readAdminSessionCookie } from '../services/admin-session.js';
import { parseBearerAuthorization } from '../services/bearer-authorization.js';

export async function authMiddleware(c: Context<Env>, next: Next): Promise<Response | void> {
  const path = new URL(c.req.url).pathname;
  const method = c.req.method;

  if (isAuthExemptPath(path, method)) {
    return next();
  }

  const token =
    parseBearerAuthorization(c.req.header('Authorization')) ?? readAdminSessionCookie(c);
  if (!token) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const valid = await isValidAdminAuthToken(c.env.API_KEY, token);
  if (!valid) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  return next();
}
