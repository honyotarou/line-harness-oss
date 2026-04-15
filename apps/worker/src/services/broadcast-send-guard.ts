import type { Context } from 'hono';
import type { Env } from '../index.js';
import { isStrictDeployedHttpsSurface } from './deployed-security-defaults.js';
import { isNonLocalHttpsWorkerUrl } from './production-cloud-policy.js';
import { timingSafeEqualUtf8 } from './timing-safe-equal.js';

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Optional second factor for mass-send: when `BROADCAST_SEND_SECRET` is set, POST
 * `/api/broadcasts/:id/send` and `/send-segment` must send matching `X-Broadcast-Send-Secret`.
 *
 * When `REQUIRE_BROADCAST_SEND_SECRET=1`, the env secret must be configured (forces second factor).
 *
 * On non-local HTTPS `WORKER_URL`, a missing `BROADCAST_SEND_SECRET` is rejected unless
 * `ALLOW_BROADCAST_WITHOUT_SEND_SECRET=1` (migration / dev only).
 */
export async function denyIfBroadcastSendSecretMissing(c: Context<Env>): Promise<Response | null> {
  const requireConfigured =
    isTruthyEnvFlag(c.env.REQUIRE_BROADCAST_SEND_SECRET) || isStrictDeployedHttpsSurface(c.env);
  const required = c.env.BROADCAST_SEND_SECRET?.trim();
  const deployedHttps = isNonLocalHttpsWorkerUrl(c.env.WORKER_URL ?? '');
  if (requireConfigured && !required) {
    return c.json(
      {
        success: false,
        error:
          'Forbidden: set BROADCAST_SEND_SECRET and send X-Broadcast-Send-Secret on mass-send endpoints (REQUIRE_BROADCAST_SEND_SECRET=1)',
      },
      503,
    );
  }
  if (deployedHttps && !required && !isTruthyEnvFlag(c.env.ALLOW_BROADCAST_WITHOUT_SEND_SECRET)) {
    return c.json(
      {
        success: false,
        error:
          'Forbidden: set BROADCAST_SEND_SECRET for this HTTPS Worker or set ALLOW_BROADCAST_WITHOUT_SEND_SECRET=1 only for migration',
      },
      503,
    );
  }
  if (!required) {
    return null;
  }
  const provided = c.req.header('X-Broadcast-Send-Secret')?.trim() ?? '';
  if (!(await timingSafeEqualUtf8(provided, required))) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  return null;
}
