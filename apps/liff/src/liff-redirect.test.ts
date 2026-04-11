import { resolveSafeRedirectUrl } from '@line-crm/shared';
import { describe, expect, it } from 'vitest';

/**
 * Mirrors Worker `/auth/line` + LIFF `window.location.href` hardening: same allowlist rules as {@link resolveSafeRedirectUrl}.
 */
describe('LIFF post-login redirect (shared allowlist)', () => {
  const env = {
    WEB_URL: 'https://app.example.com',
    WORKER_URL: 'https://worker.example.com',
    LIFF_URL: 'https://liff.line.me/123',
  };

  it('rejects javascript:, data:, protocol-relative, and unknown https origins', () => {
    expect(resolveSafeRedirectUrl('javascript:alert(1)', env)).toBeNull();
    expect(resolveSafeRedirectUrl('data:text/html,hi', env)).toBeNull();
    expect(resolveSafeRedirectUrl('//evil.example/x', env)).toBeNull();
    expect(resolveSafeRedirectUrl('https://evil.example/x', env)).toBeNull();
  });

  it('allows https targets on configured origins and LINE hosts', () => {
    expect(resolveSafeRedirectUrl('https://app.example.com/path?q=1', env)).toBe(
      'https://app.example.com/path?q=1',
    );
    expect(resolveSafeRedirectUrl('/relative', env)).toBe('https://app.example.com/relative');
    expect(resolveSafeRedirectUrl('https://line.me/R/ti/p/@x', env)).toBe(
      'https://line.me/R/ti/p/@x',
    );
  });
});
