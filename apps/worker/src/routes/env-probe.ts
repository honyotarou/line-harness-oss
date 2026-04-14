import { Hono } from 'hono';
import type { Env } from '../index.js';

function truthyEnv(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

const envProbe = new Hono<Env>();

/** Troubleshooting only: never returns secret values. */
envProbe.get('/api/_debug/env-probe', (c) => {
  if (!truthyEnv(c.env.ALLOW_WORKER_ENV_PROBE)) {
    return c.json({ success: false, error: 'Not found' }, 404);
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
      requireAdminSessionSecret: truthyEnv(c.env.REQUIRE_ADMIN_SESSION_SECRET),
      workerUrlHost,
    },
  });
});

export { envProbe };
