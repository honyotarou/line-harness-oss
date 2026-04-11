import { describe, expect, it } from 'vitest';
import { emailsMatchForRecovery, liffStateSecret } from '../../src/application/liff-identity.js';

describe('liffStateSecret', () => {
  it('prefers trimmed LIFF_STATE_SECRET when set', () => {
    expect(
      liffStateSecret({
        LIFF_STATE_SECRET: '  dedicated-state  ',
        API_KEY: 'api-key-fallback',
      } as never),
    ).toBe('dedicated-state');
  });

  it('falls back to API_KEY when LIFF_STATE_SECRET is unset or whitespace-only', () => {
    expect(
      liffStateSecret({
        API_KEY: 'only-api',
      } as never),
    ).toBe('only-api');
    expect(
      liffStateSecret({
        LIFF_STATE_SECRET: '   ',
        API_KEY: 'only-api',
      } as never),
    ).toBe('only-api');
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
