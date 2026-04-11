import { describe, expect, it } from 'vitest';
import {
  canonicalRequestPathname,
  isAuthExemptPath,
  isCloudflareAccessExemptPath,
} from '../../src/services/auth-paths.js';

describe('isAuthExemptPath', () => {
  it('treats webhook and stripe webhook as exempt', () => {
    expect(isAuthExemptPath('/webhook', 'POST')).toBe(true);
    expect(isAuthExemptPath('/api/integrations/stripe/webhook', 'POST')).toBe(true);
  });

  it('treats incoming webhook receive as exempt (exact shape; canonical dot-segments)', () => {
    expect(isAuthExemptPath('/api/webhooks/incoming/hook-1/receive', 'POST')).toBe(true);
    expect(isAuthExemptPath('/api/webhooks/../webhooks/incoming/hook-1/receive', 'POST')).toBe(
      true,
    );
    expect(isAuthExemptPath('/api/webhooks/incoming/hook-1/receive/extra', 'POST')).toBe(false);
    expect(isAuthExemptPath('/api/webhooks/incoming/hook-1', 'POST')).toBe(false);
  });

  it('treats GET form definition and POST submit as exempt', () => {
    expect(isAuthExemptPath('/api/forms/abc', 'GET')).toBe(true);
    expect(isAuthExemptPath('/api/forms/abc', 'PUT')).toBe(false);
    expect(isAuthExemptPath('/api/forms/abc/submit', 'POST')).toBe(true);
  });

  it('does not exempt admin-only analytics or link wrap (mounted with LIFF router but different path prefix)', () => {
    expect(isAuthExemptPath('/api/analytics/ref-summary', 'GET')).toBe(false);
    expect(isAuthExemptPath('/api/analytics/ref/promo', 'GET')).toBe(false);
    expect(isAuthExemptPath('/api/links/wrap', 'POST')).toBe(false);
  });

  it('treats /api/auth/login as exempt for bearer auth', () => {
    expect(isAuthExemptPath('/api/auth/login', 'POST')).toBe(true);
  });

  it('does not treat encoded-slash traversal as /api/liff/ prefix (admin paths stay protected)', () => {
    expect(isAuthExemptPath('/api/liff%2f../links/wrap', 'POST')).toBe(false);
    expect(isAuthExemptPath('/api/liff%2F../analytics/ref-summary', 'GET')).toBe(false);
    expect(isAuthExemptPath('/api/liff/../links/wrap', 'POST')).toBe(false);
  });
});

describe('canonicalRequestPathname', () => {
  it('collapses dot segments on absolute paths', () => {
    expect(canonicalRequestPathname('/api/liff/../links/wrap')).toBe('/api/links/wrap');
    expect(canonicalRequestPathname('/api/forms/x/../y/submit')).toBe('/api/forms/y/submit');
  });
});

describe('isCloudflareAccessExemptPath', () => {
  it('does not exempt /api/auth/* while still exempting webhook', () => {
    expect(isCloudflareAccessExemptPath('/api/auth/login', 'POST')).toBe(false);
    expect(isCloudflareAccessExemptPath('/webhook', 'POST')).toBe(true);
  });
});
