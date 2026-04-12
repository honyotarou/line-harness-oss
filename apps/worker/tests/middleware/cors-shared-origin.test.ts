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

describe('shared-origin CORS hardening', () => {
  it('denies shared LINE origin preflight to protected admin routes', async () => {
    const response = await worker.fetch(
      new Request('https://worker.example.com/api/tags', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://liff.line.me',
          'Access-Control-Request-Method': 'GET',
        },
      }),
      env(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('does not emit CORS headers for shared LINE origin reads against protected routes', async () => {
    const response = await worker.fetch(
      new Request('https://worker.example.com/api/tags', {
        headers: { Origin: 'https://liff.line.me' },
      }),
      env(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('still allows shared LINE origin on explicit public LIFF endpoints without credentials', async () => {
    const response = await worker.fetch(
      new Request('https://worker.example.com/api/liff/profile', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://liff.line.me',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      }),
      env(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://liff.line.me');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('preserves credentialed CORS for first-party admin origins', async () => {
    const response = await worker.fetch(
      new Request('https://worker.example.com/api/tags', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://admin.example.com',
          'Access-Control-Request-Method': 'GET',
        },
      }),
      env(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.example.com');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});
