import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addJitter,
  addMessageVariation,
  calculateStaggerDelay,
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

  it('addMessageVariation inserts a deterministic unicode variant', () => {
    const out = addMessageVariation('hello', 0);
    expect(out.length).toBeGreaterThan('hello'.length);
    expect(out).toContain('h');
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
});
