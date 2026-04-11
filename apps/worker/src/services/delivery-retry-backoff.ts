const MAX_RETRY_DELAY_MS = 60 * 60_000;

/** Exponential backoff for failed deliveries; capped at one hour. */
export function computeDeliveryRetryDelayMs(attemptCount: number, baseRetryMs: number): number {
  const exponent = Math.max(attemptCount - 1, 0);
  return Math.min(baseRetryMs * 2 ** exponent, MAX_RETRY_DELAY_MS);
}
