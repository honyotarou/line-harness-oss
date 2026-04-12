import { describe, expect, it } from 'vitest';
import {
  emailsMatchForRecovery,
  liffStateSecret,
  resolveLiffOAuthStateSecret,
} from '../../src/application/liff-identity.js';

describe('liffStateSecret', () => {
  it('prefers trimmed LIFF_STATE_SECRET when set', () => {
    expect(
      liffStateSecret({
        LIFF_STATE_SECRET: '  dedicated-state  ',
        API_KEY: 'api-key-fallback',
      } as never),
    ).toBe('dedicated-state');
  });

  it('uses API_KEY only when ALLOW_LIFF_OAUTH_API_KEY_FALLBACK is on', () => {
    expect(liffStateSecret({ API_KEY: 'only-api' } as never)).toBe('');
    expect(
      liffStateSecret({
        API_KEY: 'only-api',
        ALLOW_LIFF_OAUTH_API_KEY_FALLBACK: '1',
      } as never),
    ).toBe('only-api');
    expect(
      liffStateSecret({
        LIFF_STATE_SECRET: '   ',
        API_KEY: 'only-api',
        ALLOW_LIFF_OAUTH_API_KEY_FALLBACK: '1',
      } as never),
    ).toBe('only-api');
  });
});

describe('resolveLiffOAuthStateSecret', () => {
  it('returns null when REQUIRE_LIFF_STATE_SECRET is on but LIFF_STATE_SECRET is missing', () => {
    expect(
      resolveLiffOAuthStateSecret({
        API_KEY: 'k',
        REQUIRE_LIFF_STATE_SECRET: '1',
      } as never),
    ).toBeNull();
    expect(
      resolveLiffOAuthStateSecret({
        API_KEY: 'k',
        REQUIRE_LIFF_STATE_SECRET: '1',
        LIFF_STATE_SECRET: '   ',
      } as never),
    ).toBeNull();
  });

  it('uses LIFF_STATE_SECRET only when REQUIRE_LIFF_STATE_SECRET is on', () => {
    expect(
      resolveLiffOAuthStateSecret({
        API_KEY: 'k',
        REQUIRE_LIFF_STATE_SECRET: 'true',
        LIFF_STATE_SECRET: '  state-only  ',
      } as never),
    ).toBe('state-only');
  });

  it('returns null when LIFF is unset and API_KEY fallback is not explicitly allowed', () => {
    expect(resolveLiffOAuthStateSecret({ API_KEY: 'api' } as never)).toBeNull();
  });

  it('falls back to API_KEY when ALLOW_LIFF_OAUTH_API_KEY_FALLBACK is on', () => {
    expect(
      resolveLiffOAuthStateSecret({
        API_KEY: 'api',
        ALLOW_LIFF_OAUTH_API_KEY_FALLBACK: '1',
      } as never),
    ).toBe('api');
  });
});

describe('emailsMatchForRecovery', () => {
  it('matches case-insensitively when both present', () => {
    expect(emailsMatchForRecovery('User@Example.com', 'user@example.com')).toBe(true);
  });

  it('returns false when either side is missing', () => {
    expect(emailsMatchForRecovery(null, 'a@b.co')).toBe(false);
    expect(emailsMatchForRecovery('a@b.co', null)).toBe(false);
    expect(emailsMatchForRecovery('', 'a@b.co')).toBe(false);
  });
});
