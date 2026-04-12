import type { Context } from 'hono';
import type { Env } from '../index.js';
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
 */
export function denyIfBroadcastSendSecretMissing(c: Context<Env>): Response | null {
  const requireConfigured = isTruthyEnvFlag(c.env.REQUIRE_BROADCAST_SEND_SECRET);
  const required = c.env.BROADCAST_SEND_SECRET?.trim();
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
  if (!required) {
    return null;
  }
  const provided = c.req.header('X-Broadcast-Send-Secret')?.trim() ?? '';
  if (!timingSafeEqualUtf8(provided, required)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  return null;
}
