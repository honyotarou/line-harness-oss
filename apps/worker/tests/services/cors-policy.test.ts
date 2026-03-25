import { describe, expect, it } from 'vitest';

describe('cors policy helpers', () => {
  it('allows configured dashboard and liff origins', async () => {
    const { buildAllowedOrigins, isAllowedOrigin } = await import('../../src/services/cors-policy.js');

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
    const { buildAllowedOrigins, isAllowedOrigin } = await import('../../src/services/cors-policy.js');

    const origins = buildAllowedOrigins({
      WEB_URL: 'https://admin.example.com',
      WORKER_URL: 'https://api.example.com',
    });

    expect(isAllowedOrigin('https://evil.example.com', origins)).toBe(false);
  });
});
