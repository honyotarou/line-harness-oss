import { describe, expect, it } from 'vitest';
import { isTrustedCloudflareAccessServiceTokenPayload } from '../../src/services/cloudflare-access-service-token.js';

describe('isTrustedCloudflareAccessServiceTokenPayload', () => {
  it('matches allowlisted common_name case-insensitively', () => {
    expect(
      isTrustedCloudflareAccessServiceTokenPayload(
        { common_name: 'AbC.access' },
        'abc.access, other.access',
      ),
    ).toBe(true);
  });

  it('rejects without .access suffix or missing allowlist', () => {
    expect(
      isTrustedCloudflareAccessServiceTokenPayload({ common_name: 'nope' }, 'nope.access'),
    ).toBe(false);
    expect(isTrustedCloudflareAccessServiceTokenPayload({ common_name: 'x.access' }, '')).toBe(
      false,
    );
    expect(
      isTrustedCloudflareAccessServiceTokenPayload({ common_name: 'x.access' }, undefined),
    ).toBe(false);
  });
});
