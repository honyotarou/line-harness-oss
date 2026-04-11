import { describe, expect, it } from 'vitest';

describe('isCloudflareAccessEnforced', () => {
  it('is false when flag off or team domain missing', async () => {
    const { isCloudflareAccessEnforced } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    expect(isCloudflareAccessEnforced({})).toBe(false);
    expect(isCloudflareAccessEnforced({ REQUIRE_CLOUDFLARE_ACCESS_JWT: '1' })).toBe(false);
    expect(
      isCloudflareAccessEnforced({ CLOUDFLARE_ACCESS_TEAM_DOMAIN: 't.cloudflareaccess.com' }),
    ).toBe(false);
  });

  it('is true when flag is on and team domain set', async () => {
    const { isCloudflareAccessEnforced } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    expect(
      isCloudflareAccessEnforced({
        REQUIRE_CLOUDFLARE_ACCESS_JWT: 'on',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'corp.cloudflareaccess.com',
      }),
    ).toBe(true);
  });
});
