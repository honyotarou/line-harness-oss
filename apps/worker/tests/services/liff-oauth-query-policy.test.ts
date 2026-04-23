import { describe, expect, it } from 'vitest';
import {
  effectiveAllowLiffOAuthQueryAccount,
  effectiveAllowLiffOAuthQueryUid,
} from '../../src/services/liff-oauth-query-policy.js';

describe('liff-oauth-query-policy', () => {
  it('allows account and uid pivots when WORKER_URL is not non-local HTTPS', () => {
    const env = { WORKER_URL: 'http://localhost' };
    expect(effectiveAllowLiffOAuthQueryAccount(env)).toBe(true);
    expect(effectiveAllowLiffOAuthQueryUid(env)).toBe(true);
  });

  it('denies account and uid on HTTPS unless explicit ALLOW flags', () => {
    const env = { WORKER_URL: 'https://api.example.com' };
    expect(effectiveAllowLiffOAuthQueryAccount(env)).toBe(false);
    expect(effectiveAllowLiffOAuthQueryUid(env)).toBe(false);
  });

  it('honors ALLOW_LIFF_OAUTH_QUERY_* on HTTPS', () => {
    const env = {
      WORKER_URL: 'https://api.example.com',
      ALLOW_LIFF_OAUTH_QUERY_ACCOUNT: '1',
      ALLOW_LIFF_OAUTH_QUERY_UID: 'true',
    };
    expect(effectiveAllowLiffOAuthQueryAccount(env)).toBe(true);
    expect(effectiveAllowLiffOAuthQueryUid(env)).toBe(true);
  });
});
