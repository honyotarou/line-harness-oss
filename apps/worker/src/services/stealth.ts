// =============================================================================
// Stealth Delivery — Rate limiting, jitter, and human-like sending patterns
// =============================================================================

import { consumeRateLimitSlotDb } from './request-rate-limit.js';

/** D1 bucket for per-account LINE multicast pacing (cross-isolate; see pentest note). */
export const STEALTH_LINE_MULTICAST_RATE_BUCKET = 'stealth-line-multicast';

export type StealthRateLimiterD1Storage = Readonly<{
  db: D1Database;
  /** e.g. `line:${lineAccountId ?? 'default'}` */
  subjectKey: string;
}>;

/**
 * Add random jitter to a delay in milliseconds.
 * Returns base + random(0, jitterRange) ms.
 */
export function addJitter(baseMs: number, jitterRangeMs: number): number {
  return baseMs + Math.floor(Math.random() * jitterRangeMs);
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Add random variation to message text to avoid identical bulk messages.
 * Inserts zero-width spaces or slight punctuation variations.
 */
export function addMessageVariation(text: string, index: number): string {
  // Use different unicode whitespace characters at random positions
  // This makes each message slightly unique without visible differences
  const variations = [
    '\u200B', // zero-width space
    '\u200C', // zero-width non-joiner
    '\u200D', // zero-width joiner
    '\uFEFF', // zero-width no-break space
  ];

  if (text.length === 0) return text;

  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const varChar = variations[(buf[0]! + index) % variations.length]!;
  const position = buf[1]! % text.length;

  return text.slice(0, position) + varChar + text.slice(position);
}

/**
 * Calculate staggered delay for bulk sending.
 * Spreads messages over time to mimic human-operated account.
 *
 * @param totalMessages Total number of messages to send
 * @param batchIndex Current batch index (0-based)
 * @returns Delay in milliseconds before sending this batch
 */
export function calculateStaggerDelay(totalMessages: number, batchIndex: number): number {
  if (totalMessages <= 100) {
    // Small sends: minimal delay with jitter
    return addJitter(100, 500);
  }

  if (totalMessages <= 1000) {
    // Medium sends: spread over ~2 minutes
    const baseDelay = (120_000 / Math.ceil(totalMessages / 500)) * batchIndex;
    return addJitter(baseDelay, 2000);
  }

  // Large sends: spread over ~5 minutes with more jitter
  const baseDelay = (300_000 / Math.ceil(totalMessages / 500)) * batchIndex;
  return addJitter(baseDelay, 5000);
}

/**
 * Calculate jittered delivery time for step delivery.
 * Adds random minutes (±5 min) to scheduled delivery to avoid
 * all scenario deliveries firing at exactly the same time.
 */
export function jitterDeliveryTime(scheduledAt: Date): Date {
  const jitterMinutes = Math.floor(Math.random() * 10) - 5; // -5 to +5 minutes
  const result = new Date(scheduledAt);
  result.setMinutes(result.getMinutes() + jitterMinutes);
  return result;
}

export type StealthRateLimiter = Readonly<{
  waitForSlot: () => Promise<void>;
}>;

export function createStealthRateLimiter(
  opts?: Readonly<{
    maxCallsPerWindow?: number;
    windowMs?: number;
    d1?: StealthRateLimiterD1Storage;
  }>,
): StealthRateLimiter {
  const maxCallsPerWindow = opts?.maxCallsPerWindow ?? 1000;
  const windowMs = opts?.windowMs ?? 60_000;
  const d1 = opts?.d1;

  let callCount = 0;
  let windowStart = Date.now();

  return {
    async waitForSlot(): Promise<void> {
      if (d1) {
        while (true) {
          const decision = await consumeRateLimitSlotDb(d1.db, {
            bucket: STEALTH_LINE_MULTICAST_RATE_BUCKET,
            key: d1.subjectKey,
            limit: maxCallsPerWindow,
            windowMs,
          });
          if (decision.allowed) {
            return;
          }
          await sleep(decision.retryAfterSeconds * 1_000 + addJitter(100, 500));
        }
      }

      const now = Date.now();

      if (now - windowStart >= windowMs) {
        callCount = 0;
        windowStart = now;
      }

      if (callCount >= maxCallsPerWindow) {
        const waitTime = windowMs - (now - windowStart) + addJitter(100, 500);
        await sleep(waitTime);
        callCount = 0;
        windowStart = Date.now();
      }

      callCount++;
    },
  };
}
