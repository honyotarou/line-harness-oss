import type { Context } from 'hono';
import type { Env } from '../index.js';
import { parseBearerAuthorization } from './bearer-authorization.js';
import {
  isValidAdminAuthToken,
  readAdminSessionCookie,
  resolveAdminSessionSecret,
} from './admin-session.js';
import { effectiveRequireDedicatedAdminSessionSecret } from './deployed-security-defaults.js';

function truthyEnv(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Troubleshooting only: never returns secret values; requires admin session (Bearer or cookie). */
export async function handleEnvProbeGet(c: Context<Env>): Promise<Response> {
  if (!truthyEnv(c.env.ALLOW_WORKER_ENV_PROBE)) {
    return c.json({ success: false, error: 'Not found' }, 404);
  }

  const token =
    parseBearerAuthorization(c.req.header('Authorization')) ?? readAdminSessionCookie(c);
  if (!token) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  const secret = resolveAdminSessionSecret(c.env);
  if (!secret || !(await isValidAdminAuthToken(secret, token, c.env.DB))) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const hasDb = Boolean(c.env.DB && typeof c.env.DB.prepare === 'function');
  let workerUrlHost: string | null = null;
  try {
    const w = c.env.WORKER_URL?.trim();
    workerUrlHost = w ? new URL(w).hostname : null;
  } catch {
    workerUrlHost = 'invalid';
  }

  return c.json({
    success: true,
    data: {
      hasAdminSessionSecret: Boolean(c.env.ADMIN_SESSION_SECRET?.trim()),
      hasApiKey: Boolean(c.env.API_KEY?.trim()),
      hasDb,
      hasCloudflareAccessTeamDomain: Boolean(c.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.trim()),
      hasCloudflareAccessAudience: Boolean(c.env.CLOUDFLARE_ACCESS_AUDIENCE?.trim()),
      requireCloudflareAccessJwt: truthyEnv(c.env.REQUIRE_CLOUDFLARE_ACCESS_JWT),
      requireDedicatedAdminSessionSecret: effectiveRequireDedicatedAdminSessionSecret(c.env),
      workerUrlHost,
    },
  });
}
