const MAX_RETRY_DELAY_MS = 60 * 60_000;
/** Avoid `2 ** exponent` overflow / non-finite delay when attemptCount is corrupted or huge. */
const MAX_BACKOFF_EXPONENT = 30;

/** Exponential backoff for failed deliveries; capped at one hour. */
export function computeDeliveryRetryDelayMs(attemptCount: number, baseRetryMs: number): number {
  if (baseRetryMs <= 0) {
    return 0;
  }
  const exponent = Math.min(Math.max(attemptCount - 1, 0), MAX_BACKOFF_EXPONENT);
  const scaled = baseRetryMs * 2 ** exponent;
  if (!Number.isFinite(scaled) || scaled <= 0) {
    return MAX_RETRY_DELAY_MS;
  }
  return Math.min(scaled, MAX_RETRY_DELAY_MS);
}
