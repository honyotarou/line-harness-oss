import { describe, expect, it } from 'vitest';
import type { Env } from '../../src/index.js';
import worker from '../../src/index.js';

function env(partial: Partial<Env['Bindings']> = {}): Env['Bindings'] {
  return {
    DB: {} as D1Database,
    LINE_CHANNEL_SECRET: 'line-secret',
    LINE_CHANNEL_ACCESS_TOKEN: 'line-token',
    API_KEY: 'root-secret',
    LIFF_URL: 'https://liff.line.me/2009554425-4IMBmLQ9',
    LINE_CHANNEL_ID: 'line-channel-id',
    LINE_LOGIN_CHANNEL_ID: 'login-channel-id',
    LINE_LOGIN_CHANNEL_SECRET: 'login-channel-secret',
    WORKER_URL: 'https://worker.example.com',
    WEB_URL: 'https://admin.example.com',
    ...partial,
  } as Env['Bindings'];
}

describe('API host GET / (document navigation)', () => {
  it('returns 404 without admin session (not 401 Unauthorized)', async () => {
    const res = await worker.fetch(
      new Request('https://worker.example.com/', {
        headers: { Accept: 'application/json' },
      }),
      env(),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not found/i);
  });
});
