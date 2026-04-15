import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addJitter,
  addMessageVariation,
  calculateStaggerDelay,
  createStealthRateLimiter,
  jitterDeliveryTime,
  StealthRateLimiter,
  sleep,
} from '../../src/services/stealth.js';

describe('stealth helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('addJitter adds up to jitterRangeMs based on Math.random', () => {
    const rnd = vi.spyOn(Math, 'random');
    rnd.mockReturnValue(0);
    expect(addJitter(100, 50)).toBe(100);
    rnd.mockReturnValue(0.999);
    expect(addJitter(100, 50)).toBe(149);
  });

  it('addMessageVariation returns empty string unchanged', () => {
    expect(addMessageVariation('', 0)).toBe('');
  });

  it('addMessageVariation inserts a unicode variant using crypto randomness', () => {
    vi.stubGlobal('crypto', {
      getRandomValues(arr: Uint32Array) {
        arr[0] = 0;
        arr[1] = 2;
        return arr;
      },
    });
    const out = addMessageVariation('hello', 0);
    expect(out.length).toBeGreaterThan('hello'.length);
    expect(out).toContain('h');
    vi.unstubAllGlobals();
  });

  it('calculateStaggerDelay uses small jitter for <=100 messages', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(calculateStaggerDelay(50, 0)).toBe(100);
  });

  it('calculateStaggerDelay scales with batch index for large sends', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const d0 = calculateStaggerDelay(2000, 0);
    const d1 = calculateStaggerDelay(2000, 1);
    expect(d1).toBeGreaterThanOrEqual(d0);
  });

  it('jitterDeliveryTime shifts minutes by random offset in [-5, 4]', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const base = new Date('2026-03-26T12:00:00Z');
    const out = jitterDeliveryTime(base);
    expect(out.getTime()).toBe(base.getTime() - 5 * 60_000);
  });

  it('sleep resolves after the given delay', async () => {
    vi.useFakeTimers();
    const p = sleep(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('StealthRateLimiter allows calls under the per-window cap', async () => {
    const limiter = new StealthRateLimiter(10, 60_000);
    await limiter.waitForSlot();
    await limiter.waitForSlot();
  });

  it('createStealthRateLimiter allows calls under the per-window cap', async () => {
    const limiter = createStealthRateLimiter({ maxCallsPerWindow: 10, windowMs: 60_000 });
    await limiter.waitForSlot();
    await limiter.waitForSlot();
  });

  /**
   * Pentest: multicast pacing must not rely on per-isolate memory alone.
   * Production paths (`broadcast`, `segment-send`) pass D1; this locks that contract.
   */
  it('StealthRateLimiter with db delegates to consumeRateLimitSlotDb for shared caps', async () => {
    const rr = await import('../../src/services/request-rate-limit.js');
    const spy = vi.spyOn(rr, 'consumeRateLimitSlotDb').mockResolvedValue({
      allowed: true,
      remaining: 999,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 60,
    });
    const { StealthRateLimiter, STEALTH_LINE_MULTICAST_RATE_BUCKET } = await import(
      '../../src/services/stealth.js'
    );
    const db = {} as D1Database;
    const limiter = new StealthRateLimiter(1000, 60_000, { db, subjectKey: 'line:test-acct' });
    await limiter.waitForSlot();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        bucket: STEALTH_LINE_MULTICAST_RATE_BUCKET,
        key: 'line:test-acct',
        limit: 1000,
        windowMs: 60_000,
      }),
    );
  });

  it('createStealthRateLimiter with db delegates to consumeRateLimitSlotDb for shared caps', async () => {
    const rr = await import('../../src/services/request-rate-limit.js');
    const spy = vi.spyOn(rr, 'consumeRateLimitSlotDb').mockResolvedValue({
      allowed: true,
      remaining: 999,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 60,
    });
    const { createStealthRateLimiter, STEALTH_LINE_MULTICAST_RATE_BUCKET } = await import(
      '../../src/services/stealth.js'
    );
    const db = {} as D1Database;
    const limiter = createStealthRateLimiter({
      maxCallsPerWindow: 1000,
      windowMs: 60_000,
      d1: { db, subjectKey: 'line:test-acct' },
    });
    await limiter.waitForSlot();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        bucket: STEALTH_LINE_MULTICAST_RATE_BUCKET,
        key: 'line:test-acct',
        limit: 1000,
        windowMs: 60_000,
      }),
    );
  });
});
