import { describe, expect, it } from 'vitest';

describe('isAdminSessionSecretRequired', () => {
  it('is true on non-local HTTPS or when REQUIRE_ADMIN_SESSION_SECRET is set', async () => {
    const { isAdminSessionSecretRequired, isDedicatedAdminSessionSecretConfigured } = await import(
      '../../src/services/admin-session.js'
    );
    expect(isAdminSessionSecretRequired({})).toBe(false);
    expect(isAdminSessionSecretRequired({ WORKER_URL: 'https://api.example.com' })).toBe(true);
    expect(
      isAdminSessionSecretRequired({
        WORKER_URL: 'https://api.example.com',
        RELAX_DEPLOYED_SECURITY_DEFAULTS: '1',
        RELAX_DEPLOYED_SECURITY_CONFIRM: 'YES_I_ACCEPT_REDUCED_SECURITY',
      }),
    ).toBe(false);
    expect(isAdminSessionSecretRequired({ REQUIRE_ADMIN_SESSION_SECRET: '1' })).toBe(true);
    expect(isDedicatedAdminSessionSecretConfigured({})).toBe(false);
    expect(isDedicatedAdminSessionSecretConfigured({ ADMIN_SESSION_SECRET: 'x' })).toBe(true);
  });
});

describe('resolveAdminSessionSameSite', () => {
  it('uses Lax on localhost regardless of env flag', async () => {
    const { resolveAdminSessionSameSite } = await import('../../src/services/admin-session.js');
    const env = { ADMIN_SESSION_COOKIE_SAMESITE_NONE: '1' };
    expect(resolveAdminSessionSameSite('localhost', env)).toBe('Lax');
    expect(resolveAdminSessionSameSite('127.0.0.1', env)).toBe('Lax');
  });

  it('uses Lax on non-local hosts unless ADMIN_SESSION_COOKIE_SAMESITE_NONE is truthy', async () => {
    const { resolveAdminSessionSameSite } = await import('../../src/services/admin-session.js');
    expect(resolveAdminSessionSameSite('api.example.com', {})).toBe('Lax');
    expect(
      resolveAdminSessionSameSite('api.example.com', { ADMIN_SESSION_COOKIE_SAMESITE_NONE: '0' }),
    ).toBe('Lax');
    expect(
      resolveAdminSessionSameSite('api.example.com', { ADMIN_SESSION_COOKIE_SAMESITE_NONE: '1' }),
    ).toBe('None');
    expect(
      resolveAdminSessionSameSite('api.example.com', {
        ADMIN_SESSION_COOKIE_SAMESITE_NONE: 'true',
      }),
    ).toBe('None');
  });
});

describe('admin session tokens', () => {
  it('issues and verifies signed admin sessions', async () => {
    const { issueAdminSessionToken, verifyAdminSessionToken } = await import(
      '../../src/services/admin-session.js'
    );

    const token = await issueAdminSessionToken('root-api-key', {
      issuedAt: 1_700_000_000,
      expiresInSeconds: 3600,
      jti: 'test-jti-stable',
    });
    const verified = await verifyAdminSessionToken('root-api-key', token, {
      now: 1_700_000_100,
    });

    expect(verified).toEqual({
      scope: 'admin',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
      jti: 'test-jti-stable',
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

  it('rejects tokens whose exp-iat span exceeds MAX_ADMIN_SESSION_VERIFIED_SPAN_SECONDS', async () => {
    const {
      issueAdminSessionToken,
      verifyAdminSessionToken,
      MAX_ADMIN_SESSION_VERIFIED_SPAN_SECONDS,
    } = await import('../../src/services/admin-session.js');

    const iat = 1_700_000_000;
    const token = await issueAdminSessionToken('root-api-key', {
      issuedAt: iat,
      expiresInSeconds: MAX_ADMIN_SESSION_VERIFIED_SPAN_SECONDS + 60,
    });

    await expect(
      verifyAdminSessionToken('root-api-key', token, { now: iat + 120 }),
    ).resolves.toBeNull();
  });

  it('isValidAdminAuthToken rejects a revoked jti when D1 is provided', async () => {
    const { issueAdminSessionToken, isValidAdminAuthToken } = await import(
      '../../src/services/admin-session.js'
    );
    const jti = 'jti-to-revoke';
    const token = await issueAdminSessionToken('session-secret', {
      issuedAt: 1_800_000_000,
      expiresInSeconds: 3600,
      jti,
    });
    let revoked = false;
    const db = {
      prepare(sql: string) {
        const q = sql.toLowerCase();
        return {
          bind: (...args: unknown[]) => ({
            async first() {
              if (q.includes('admin_session_revocations') && q.includes('select')) {
                if (revoked && args[0] === jti) return { ok: 1 };
                return null;
              }
              return null;
            },
            async run() {
              return { success: true };
            },
            async all() {
              return { results: [] };
            },
          }),
        };
      },
    } as unknown as D1Database;

    await expect(isValidAdminAuthToken('session-secret', token, db)).resolves.toBe(true);
    revoked = true;
    await expect(isValidAdminAuthToken('session-secret', token, db)).resolves.toBe(false);
  });
});
