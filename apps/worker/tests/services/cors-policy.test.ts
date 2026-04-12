import { describe, expect, it } from 'vitest';

describe('cors policy helpers', () => {
  it('skips CORS header logic when Origin is absent (non-browser clients)', async () => {
    const { shouldApplyCorsForOriginHeader } = await import('../../src/services/cors-policy.js');
    expect(shouldApplyCorsForOriginHeader(undefined)).toBe(false);
    expect(shouldApplyCorsForOriginHeader('')).toBe(false);
    expect(shouldApplyCorsForOriginHeader('   ')).toBe(false);
    expect(shouldApplyCorsForOriginHeader('https://admin.example.com')).toBe(true);
  });

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

  it('rejects the literal Origin string "null" (sandboxed / opaque origins)', async () => {
    const { buildAllowedOrigins, isAllowedOrigin } = await import(
      '../../src/services/cors-policy.js'
    );

    const origins = buildAllowedOrigins({
      WEB_URL: 'https://admin.example.com',
    });

    expect(isAllowedOrigin('null', origins)).toBe(false);
    expect(isAllowedOrigin('Null', origins)).toBe(false);
  });

  it('exports CORS allow-headers including CSRF client header for browser admin', async () => {
    const { ACCESS_CONTROL_ALLOW_HEADERS } = await import('../../src/services/cors-policy.js');
    const { ADMIN_BROWSER_CLIENT_HEADER } = await import('@line-crm/shared');
    expect(ACCESS_CONTROL_ALLOW_HEADERS).toContain(ADMIN_BROWSER_CLIENT_HEADER);
    expect(ACCESS_CONTROL_ALLOW_HEADERS).toContain('Authorization');
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

  it('treats official LINE hosts as shared origins, not trusted admin origins', async () => {
    const { isSharedLineHostedOrigin } = await import('../../src/services/cors-policy.js');

    expect(isSharedLineHostedOrigin('https://liff.line.me/app')).toBe(true);
    expect(isSharedLineHostedOrigin('https://access.line.me')).toBe(true);
    expect(isSharedLineHostedOrigin('https://admin.example.com')).toBe(false);
  });

  it('allows shared LINE origin CORS only on explicit public LIFF/browser paths', async () => {
    const { isAllowedSharedLineCorsPath } = await import('../../src/services/cors-policy.js');

    expect(isAllowedSharedLineCorsPath('/api/liff/profile', 'POST')).toBe(true);
    expect(isAllowedSharedLineCorsPath('/api/forms/form-1', 'GET')).toBe(true);
    expect(isAllowedSharedLineCorsPath('/api/forms/form-1/submit', 'POST')).toBe(true);
    expect(isAllowedSharedLineCorsPath('/api/affiliates/click', 'POST')).toBe(true);

    expect(isAllowedSharedLineCorsPath('/api/auth/session', 'GET')).toBe(false);
    expect(isAllowedSharedLineCorsPath('/api/tags', 'GET')).toBe(false);
    expect(isAllowedSharedLineCorsPath('/api/webhooks/incoming/incoming-1/receive', 'POST')).toBe(
      false,
    );
  });
});
