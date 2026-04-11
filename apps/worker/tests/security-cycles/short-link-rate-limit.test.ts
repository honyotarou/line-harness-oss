/**
 * Cycle 4 — Attacker view: GET /r/:ref is unauthenticated; brute force or cache-bust can waste Worker CPU.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetRequestRateLimits } from '../../src/services/request-rate-limit.js';

describe('Cycle 4: short link landing rate limit', () => {
  const baseEnv = {
    DB: {} as unknown as D1Database,
    LINE_CHANNEL_SECRET: 'secret',
    LINE_CHANNEL_ACCESS_TOKEN: 'token',
    API_KEY: 'api-key',
    LIFF_URL: 'https://liff.line.me/2009554425-4IMBmLQ9',
    LINE_CHANNEL_ID: 'channel-id',
    LINE_LOGIN_CHANNEL_ID: 'login-channel-id',
    LINE_LOGIN_CHANNEL_SECRET: 'login-secret',
    WORKER_URL: 'https://worker.example.com',
  };

  beforeEach(() => {
    resetRequestRateLimits();
  });

  afterEach(() => {
    resetRequestRateLimits();
  });

  it('returns 429 after the per-IP landing page budget is exceeded', async () => {
    const mod = (await import('../../src/index.js')) as { default: { fetch: typeof fetch } };

    let lastStatus = 200;
    for (let i = 0; i < 150; i += 1) {
      const res = await mod.default.fetch(
        new Request('http://localhost/r/ref-spam', {
          headers: { 'CF-Connecting-IP': '198.51.100.99' },
        }),
        baseEnv as never,
        {} as never,
      );
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });
});
