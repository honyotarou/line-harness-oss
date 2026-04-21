import type { Context } from 'hono';
import { buildAdminAccessLoginCompleteReturnTo } from '@line-crm/shared';
import type { Env } from '../index.js';
import { isCloudflareAccessEnforced } from './cloudflare-access-principal.js';

export function respondMissingAdminSession(c: Context<Env>): Response {
  if (isCloudflareAccessEnforced(c.env) && c.get('cfAccessJwtPayload')) {
    return c.redirect(buildAdminAccessLoginCompleteReturnTo('/login'), 302);
  }
  return c.json({ success: false, error: 'Unauthorized', code: 'MISSING_ADMIN_SESSION' }, 401);
}
