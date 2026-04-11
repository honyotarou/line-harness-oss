import { describe, expect, it } from 'vitest';

describe('resolveAdminSessionSecret', () => {
  it('falls back to API_KEY when ADMIN_SESSION_SECRET is unset and Worker is not a public HTTPS deployment', async () => {
    const { resolveAdminSessionSecret } = await import('../../src/services/admin-session.js');
    expect(resolveAdminSessionSecret({ API_KEY: 'k' })).toBe('k');
    expect(resolveAdminSessionSecret({ API_KEY: 'k', ADMIN_SESSION_SECRET: '' })).toBe('k');
    expect(resolveAdminSessionSecret({ API_KEY: 'k', ADMIN_SESSION_SECRET: '   ' })).toBe('k');
    expect(resolveAdminSessionSecret({ API_KEY: 'k', WORKER_URL: 'http://127.0.0.1:8787' })).toBe(
      'k',
    );
  });

  it('returns null for non-local HTTPS WORKER_URL without ADMIN_SESSION_SECRET unless legacy flag is set', async () => {
    const { resolveAdminSessionSecret } = await import('../../src/services/admin-session.js');
    const base = { API_KEY: 'k', WORKER_URL: 'https://line-crm.example.workers.dev' };
    expect(resolveAdminSessionSecret(base)).toBeNull();
    expect(resolveAdminSessionSecret({ ...base, ALLOW_LEGACY_API_KEY_SESSION_SIGNER: '1' })).toBe(
      'k',
    );
  });

  it('uses trimmed ADMIN_SESSION_SECRET when non-empty', async () => {
    const { resolveAdminSessionSecret } = await import('../../src/services/admin-session.js');
    expect(resolveAdminSessionSecret({ API_KEY: 'k', ADMIN_SESSION_SECRET: '  sess  ' })).toBe(
      'sess',
    );
  });
});

describe('admin session signing secret split from API_KEY', () => {
  it('does not treat raw API_KEY as a session token (middleware stays strict)', async () => {
    const { isValidAdminAuthToken } = await import('../../src/services/admin-session.js');
    await expect(isValidAdminAuthToken('api-key', 'api-key')).resolves.toBe(false);
  });

  it('issues and verifies sessions with ADMIN_SESSION_SECRET while API_KEY differs', async () => {
    const { issueAdminSessionToken, isValidAdminAuthToken, resolveAdminSessionSecret } =
      await import('../../src/services/admin-session.js');
    const env = { API_KEY: 'public-api', ADMIN_SESSION_SECRET: 'hmac-session-only' };
    expect(resolveAdminSessionSecret(env)).toBe('hmac-session-only');

    const secret = resolveAdminSessionSecret(env);
    expect(secret).toBe('hmac-session-only');
    const tok = await issueAdminSessionToken(secret!, {
      issuedAt: 1_800_000_000,
      expiresInSeconds: 3600,
    });
    await expect(isValidAdminAuthToken(secret!, tok)).resolves.toBe(true);
    await expect(isValidAdminAuthToken(env.API_KEY, tok)).resolves.toBe(false);
  });
});
