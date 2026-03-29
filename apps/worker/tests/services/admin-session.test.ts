import { describe, expect, it } from 'vitest';

describe('admin session tokens', () => {
  it('issues and verifies signed admin sessions', async () => {
    const { issueAdminSessionToken, verifyAdminSessionToken } = await import(
      '../../src/services/admin-session.js'
    );

    const token = await issueAdminSessionToken('root-api-key', {
      issuedAt: 1_700_000_000,
      expiresInSeconds: 3600,
    });
    const verified = await verifyAdminSessionToken('root-api-key', token, {
      now: 1_700_000_100,
    });

    expect(verified).toEqual({
      scope: 'admin',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
  });

  it('rejects expired or tampered tokens', async () => {
    const { issueAdminSessionToken, verifyAdminSessionToken } = await import(
      '../../src/services/admin-session.js'
    );

    const token = await issueAdminSessionToken('root-api-key', {
      issuedAt: 1_700_000_000,
      expiresInSeconds: 60,
    });

    await expect(
      verifyAdminSessionToken('root-api-key', token, { now: 1_700_000_061 }),
    ).resolves.toBeNull();

    const tampered = `${token}broken`;
    await expect(
      verifyAdminSessionToken('root-api-key', tampered, { now: 1_700_000_001 }),
    ).resolves.toBeNull();
  });
});
