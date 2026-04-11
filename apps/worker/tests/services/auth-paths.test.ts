import { describe, expect, it } from 'vitest';
import { isAuthExemptPath, isCloudflareAccessExemptPath } from '../../src/services/auth-paths.js';

describe('isAuthExemptPath', () => {
  it('treats webhook and stripe webhook as exempt', () => {
    expect(isAuthExemptPath('/webhook', 'POST')).toBe(true);
    expect(isAuthExemptPath('/api/integrations/stripe/webhook', 'POST')).toBe(true);
  });

  it('treats GET form definition and POST submit as exempt', () => {
    expect(isAuthExemptPath('/api/forms/abc', 'GET')).toBe(true);
    expect(isAuthExemptPath('/api/forms/abc', 'PUT')).toBe(false);
    expect(isAuthExemptPath('/api/forms/abc/submit', 'POST')).toBe(true);
  });

  it('treats /api/auth/login as exempt for bearer auth', () => {
    expect(isAuthExemptPath('/api/auth/login', 'POST')).toBe(true);
  });
});

describe('isCloudflareAccessExemptPath', () => {
  it('does not exempt /api/auth/* while still exempting webhook', () => {
    expect(isCloudflareAccessExemptPath('/api/auth/login', 'POST')).toBe(false);
    expect(isCloudflareAccessExemptPath('/webhook', 'POST')).toBe(true);
  });
});
