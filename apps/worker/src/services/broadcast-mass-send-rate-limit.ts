import type { Context } from 'hono';
import type { Env } from '../index.js';
import { enforceRateLimit, massSendAdminRateLimitKey } from './request-rate-limit.js';

/** Caps burst mass sends if `X-Broadcast-Send-Secret` leaks (D1-backed when DB is bound). */
const BROADCAST_MASS_SEND_RATE = { limit: 3, windowMs: 60_000 };

export async function enforceBroadcastMassSendRateLimit(
  c: Context<Env>,
  bucket: 'broadcast-send' | 'broadcast-send-segment' | 'broadcast-test-push',
): Promise<Response | null> {
  return enforceRateLimit(c, {
    bucket,
    limit: BROADCAST_MASS_SEND_RATE.limit,
    windowMs: BROADCAST_MASS_SEND_RATE.windowMs,
    db: c.env.DB,
    resolveKey: massSendAdminRateLimitKey,
  });
}
