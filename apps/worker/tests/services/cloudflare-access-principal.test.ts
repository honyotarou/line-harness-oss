import { describe, expect, it } from 'vitest';

describe('isCloudflareAccessEnforced', () => {
  it('is false when flag off or team domain missing', async () => {
    const { isCloudflareAccessEnforced } = await import(
      '../../src/services/cloudflare-access-principal.js'
    );
    expect(isCloudflareAccessEnforced({})).toBe(false);
    expect(isCloudflareAccessEnforced({ REQUIRE_CLOUDFLARE_ACCESS_JWT: '1' })).toBe(false);
    expect(
      isCloudflareAccessEnforced({ CLOUDFLARE_ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com' }),
    ).toBe(false);
  });

  it('is true when flag is on and team domain set', async () => {
    const { isCloudflareAccessEnforced } = await import(
      '../../src/services/cloudflare-access-principal.js'
    );
    expect(
      isCloudflareAccessEnforced({
        REQUIRE_CLOUDFLARE_ACCESS_JWT: 'on',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'corp.cloudflareaccess.com',
      }),
    ).toBe(true);
  });
});

describe('getValidatedAccessEmailFromPayload', () => {
  it('returns null for missing, non-string, empty, or invalid email', async () => {
    const { getValidatedAccessEmailFromPayload } = await import(
      '../../src/services/cloudflare-access-principal.js'
    );
    expect(getValidatedAccessEmailFromPayload(undefined)).toBeNull();
    expect(getValidatedAccessEmailFromPayload(null)).toBeNull();
    expect(getValidatedAccessEmailFromPayload({})).toBeNull();
    expect(getValidatedAccessEmailFromPayload({ email: 1 })).toBeNull();
    expect(getValidatedAccessEmailFromPayload({ email: '' })).toBeNull();
    expect(getValidatedAccessEmailFromPayload({ email: '   ' })).toBeNull();
    expect(getValidatedAccessEmailFromPayload({ email: 'not-email' })).toBeNull();
    expect(getValidatedAccessEmailFromPayload({ email: '  A@X.COM  ' })).toBe('a@x.com');
    expect(getValidatedAccessEmailFromPayload({ email: 'user@example.com' })).toBe(
      'user@example.com',
    );
  });

  it('uses only the email claim; ignores preferred_username', async () => {
    const { getValidatedAccessEmailFromPayload } = await import(
      '../../src/services/cloudflare-access-principal.js'
    );
    expect(
      getValidatedAccessEmailFromPayload({
        email: 'first@a.com',
        preferred_username: 'second@b.com',
      }),
    ).toBe('first@a.com');
    expect(getValidatedAccessEmailFromPayload({ preferred_username: '  U@OIDC.DEV  ' })).toBeNull();
    expect(
      getValidatedAccessEmailFromPayload({
        email: 'bad',
        preferred_username: 'ok@fallback.com',
      }),
    ).toBeNull();
  });

  it('rejects email longer than 320 characters', async () => {
    const { getValidatedAccessEmailFromPayload } = await import(
      '../../src/services/cloudflare-access-principal.js'
    );
    const long = `${'a'.repeat(315)}@x.com`;
    expect(long.length).toBe(321);
    expect(getValidatedAccessEmailFromPayload({ email: long })).toBeNull();
  });
});
