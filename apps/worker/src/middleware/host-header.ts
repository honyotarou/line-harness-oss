import type { Context, Next } from 'hono';
import type { Env } from '../index.js';
import {
  isHostAllowed,
  parseAllowedHostnames,
  shouldEnforceHostAllowlist,
} from '../services/host-policy.js';

export async function hostHeaderMiddleware(c: Context<Env>, next: Next): Promise<Response | void> {
  const raw = c.env.ALLOWED_HOSTNAMES;
  if (!shouldEnforceHostAllowlist(raw)) {
    return next();
  }

  const allowed = parseAllowedHostnames(raw);
  const hostHeader = c.req.header('Host');
  if (!isHostAllowed(hostHeader, allowed)) {
    return c.json({ success: false, error: 'Invalid Host header' }, 403);
  }

  return next();
}
