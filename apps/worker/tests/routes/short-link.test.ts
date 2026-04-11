import { beforeEach, describe, expect, it } from 'vitest';
import { resetRequestRateLimits } from '../../src/services/request-rate-limit.js';

describe('short link landing (/r/:ref)', () => {
  beforeEach(() => {
    resetRequestRateLimits();
  });
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

  it('returns error HTML when LIFF_URL is a placeholder (YOUR_LIFF_ID)', async () => {
    const mod = (await import('../../src/index.js')) as { default: { fetch: typeof fetch } };
    const res = await mod.default.fetch(
      new Request('http://localhost/r/test-ref'),
      { ...baseEnv, LIFF_URL: 'https://liff.line.me/YOUR_LIFF_ID' } as never,
      {} as never,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('LIFF_URL');
    expect(html).toContain('設定');
  });
});
