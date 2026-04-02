import type { Context, Next } from 'hono';
import type { Env } from '../index.js';
import { isValidAdminAuthToken, readAdminSessionCookie } from '../services/admin-session.js';

export async function authMiddleware(c: Context<Env>, next: Next): Promise<Response | void> {
  // Skip auth for the LINE webhook endpoint — it uses signature verification instead
  // Skip auth for OpenAPI docs — public documentation
  const path = new URL(c.req.url).pathname;
  const method = c.req.method;
  const publicFormDefinitionGet = method === 'GET' && /^\/api\/forms\/[^/]+$/.test(path);
  const publicFormSubmitPost = method === 'POST' && /^\/api\/forms\/[^/]+\/submit$/.test(path);

  if (
    path === '/webhook' ||
    path === '/docs' ||
    path === '/openapi.json' ||
    path === '/api/affiliates/click' ||
    path.startsWith('/t/') ||
    path.startsWith('/r/') ||
    path.startsWith('/api/liff/') ||
    path === '/api/auth/login' ||
    path === '/api/auth/session' ||
    path === '/api/auth/logout' ||
    path.startsWith('/auth/') ||
    path === '/api/integrations/stripe/webhook' ||
    path.match(/^\/api\/webhooks\/incoming\/[^/]+\/receive$/) ||
    publicFormSubmitPost ||
    publicFormDefinitionGet
  ) {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  const token = bearerToken ?? readAdminSessionCookie(c);
  if (!token) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const valid = await isValidAdminAuthToken(c.env.API_KEY, token);
  if (!valid) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  return next();
}
