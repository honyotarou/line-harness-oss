import type { Context } from 'hono';
import type { Env } from '../index.js';
import { timingSafeEqualUtf8 } from './timing-safe-equal.js';

/**
 * Optional second factor for mass-send: when `BROADCAST_SEND_SECRET` is set, POST
 * `/api/broadcasts/:id/send` and `/send-segment` must send matching `X-Broadcast-Send-Secret`.
 */
export function denyIfBroadcastSendSecretMissing(c: Context<Env>): Response | null {
  const required = c.env.BROADCAST_SEND_SECRET?.trim();
  if (!required) {
    return null;
  }
  const provided = c.req.header('X-Broadcast-Send-Secret')?.trim() ?? '';
  if (!timingSafeEqualUtf8(provided, required)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  return null;
}
