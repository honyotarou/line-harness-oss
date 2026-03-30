import { describe, expect, it } from 'vitest';

describe('cors policy helpers', () => {
  it('allows configured dashboard and liff origins', async () => {
    const { buildAllowedOrigins, isAllowedOrigin } = await import(
      '../../src/services/cors-policy.js'
    );

    const origins = buildAllowedOrigins({
      WEB_URL: 'https://admin.example.com',
      WORKER_URL: 'https://api.example.com',
      LIFF_URL: 'https://liff.line.me/12345',
      ALLOWED_ORIGINS: 'https://preview.example.com, https://staging.example.com',
    });

    expect(origins).toContain('https://admin.example.com');
    expect(origins).toContain('https://api.example.com');
    expect(origins).toContain('https://liff.line.me');
    expect(origins).toContain('https://preview.example.com');
    expect(isAllowedOrigin('https://staging.example.com', origins)).toBe(true);
  });

  it('rejects unknown origins', async () => {
    const { buildAllowedOrigins, isAllowedOrigin } = await import(
      '../../src/services/cors-policy.js'
    );

    const origins = buildAllowedOrigins({
      WEB_URL: 'https://admin.example.com',
      WORKER_URL: 'https://api.example.com',
    });

    expect(isAllowedOrigin('https://evil.example.com', origins)).toBe(false);
  });

  it('does not implicitly allow localhost; only env-configured origins', async () => {
    const { buildAllowedOrigins } = await import('../../src/services/cors-policy.js');
    const origins = buildAllowedOrigins({
      WEB_URL: 'https://app.vercel.app',
      WORKER_URL: 'https://api.example.workers.dev',
    });
    expect(origins).not.toContain('http://localhost:3001');
    expect(origins).not.toContain('http://127.0.0.1:8787');
    expect(origins).toContain('https://app.vercel.app');
    expect(origins).toContain('https://api.example.workers.dev');
  });

  it('with empty env returns no allowed origins', async () => {
    const { buildAllowedOrigins } = await import('../../src/services/cors-policy.js');
    expect(buildAllowedOrigins({})).toEqual([]);
  });

  it('accepts origins when allowed list is a Set (middleware hot path)', async () => {
    const { buildAllowedOrigins, isAllowedOrigin } = await import(
      '../../src/services/cors-policy.js'
    );

    const set = new Set(
      buildAllowedOrigins({
        WEB_URL: 'https://admin.example.com',
      }),
    );

    expect(isAllowedOrigin('https://admin.example.com', set)).toBe(true);
    expect(isAllowedOrigin('https://evil.example.com', set)).toBe(false);
  });
});
