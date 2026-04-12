import { describe, expect, it, vi, afterEach } from 'vitest';
import * as jose from 'jose';

function jwksJsonResponse(body: object, responseUrl?: string): Response {
  const res = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
  if (responseUrl) {
    Object.defineProperty(res, 'url', { value: responseUrl, configurable: true });
  }
  return res;
}

describe('verifyCloudflareAccessJwt', () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    const { resetCloudflareAccessJwksCacheForTests } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    resetCloudflareAccessJwksCacheForTests();
  });

  it('rejects when jwt is empty', async () => {
    const { verifyCloudflareAccessJwt } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    const r = await verifyCloudflareAccessJwt({
      jwt: '',
      teamDomain: 'team.cloudflareaccess.com',
      fetchFn: vi.fn(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/missing/i);
  });

  it('rejects when certs fetch fails', async () => {
    const teamDomain = 'team.cloudflareaccess.com';
    const issuer = `https://${teamDomain}`;
    const { privateKey } = await jose.generateKeyPair('RS256', { extractable: true });

    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'kid-fetch-fail' })
      .setIssuer(issuer)
      .setExpirationTime('1h')
      .sign(privateKey);

    const { verifyCloudflareAccessJwt } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    const r = await verifyCloudflareAccessJwt({
      jwt,
      teamDomain,
      fetchFn,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cert/i);
  });

  it('accepts a valid RS256 JWT signed by a key published in mocked JWKS', async () => {
    const teamDomain = 'testteam.cloudflareaccess.com';
    const issuer = `https://${teamDomain}`;

    const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { extractable: true });
    const pubJwk = await jose.exportJWK(publicKey);
    pubJwk.kid = 'cf-access-test-kid';
    pubJwk.alg = 'RS256';
    pubJwk.use = 'sig';

    const jwt = await new jose.SignJWT({ email: 'admin@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'cf-access-test-kid' })
      .setIssuer(issuer)
      .setAudience('test-aud')
      .setExpirationTime('1h')
      .sign(privateKey);

    const fetchFn = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      expect(url).toBe(`https://${teamDomain}/cdn-cgi/access/certs`);
      expect(init?.redirect).toBe('error');
      return jwksJsonResponse({ keys: [pubJwk] });
    });

    const { verifyCloudflareAccessJwt } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    const r = await verifyCloudflareAccessJwt({
      jwt,
      teamDomain,
      fetchFn,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.email).toBe('admin@example.com');
    }
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects when email is not in CLOUDFLARE_ACCESS_ALLOWED_EMAILS', async () => {
    const teamDomain = 'testteam.cloudflareaccess.com';
    const issuer = `https://${teamDomain}`;

    const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { extractable: true });
    const pubJwk = await jose.exportJWK(publicKey);
    pubJwk.kid = 'kid-email';
    pubJwk.alg = 'RS256';
    pubJwk.use = 'sig';

    const jwt = await new jose.SignJWT({ email: 'evil@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'kid-email' })
      .setIssuer(issuer)
      .setExpirationTime('1h')
      .sign(privateKey);

    const fetchFn = vi.fn().mockResolvedValue(jwksJsonResponse({ keys: [pubJwk] }));

    const { verifyCloudflareAccessJwt } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    const r = await verifyCloudflareAccessJwt({
      jwt,
      teamDomain,
      allowedEmails: 'good@example.com',
      fetchFn,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/email/i);
  });

  it('rejects allowlist when only preferred_username is set (email claim required)', async () => {
    const teamDomain = 'testteam.cloudflareaccess.com';
    const issuer = `https://${teamDomain}`;

    const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { extractable: true });
    const pubJwk = await jose.exportJWK(publicKey);
    pubJwk.kid = 'kid-pu';
    pubJwk.alg = 'RS256';
    pubJwk.use = 'sig';

    const jwt = await new jose.SignJWT({ preferred_username: 'good@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'kid-pu' })
      .setIssuer(issuer)
      .setExpirationTime('1h')
      .sign(privateKey);

    const fetchFn = vi.fn().mockResolvedValue(jwksJsonResponse({ keys: [pubJwk] }));

    const { verifyCloudflareAccessJwt } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    const r = await verifyCloudflareAccessJwt({
      jwt,
      teamDomain,
      allowedEmails: 'good@example.com',
      fetchFn,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/email/i);
  });

  it('rejects expired jwt', async () => {
    const teamDomain = 'testteam.cloudflareaccess.com';
    const issuer = `https://${teamDomain}`;

    const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { extractable: true });
    const pubJwk = await jose.exportJWK(publicKey);
    pubJwk.kid = 'kid-exp';
    pubJwk.alg = 'RS256';
    pubJwk.use = 'sig';

    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'kid-exp' })
      .setIssuer(issuer)
      .setExpirationTime(new Date(Date.now() - 60_000))
      .sign(privateKey);

    const fetchFn = vi.fn().mockResolvedValue(jwksJsonResponse({ keys: [pubJwk] }));

    const { verifyCloudflareAccessJwt } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    const r = await verifyCloudflareAccessJwt({
      jwt,
      teamDomain,
      fetchFn,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects wrong aud when expectedAudience is set', async () => {
    const teamDomain = 'testteam.cloudflareaccess.com';
    const issuer = `https://${teamDomain}`;

    const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { extractable: true });
    const pubJwk = await jose.exportJWK(publicKey);
    pubJwk.kid = 'kid-aud-wrong';
    pubJwk.alg = 'RS256';
    pubJwk.use = 'sig';

    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'kid-aud-wrong' })
      .setIssuer(issuer)
      .setAudience('some-other-app')
      .setExpirationTime('1h')
      .sign(privateKey);

    const fetchFn = vi.fn().mockResolvedValue(jwksJsonResponse({ keys: [pubJwk] }));

    const { verifyCloudflareAccessJwt } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    const r = await verifyCloudflareAccessJwt({
      jwt,
      teamDomain,
      expectedAudience: 'line-harness-admin',
      fetchFn,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/audience/i);
  });

  it('accepts aud array when it includes expectedAudience', async () => {
    const teamDomain = 'testteam.cloudflareaccess.com';
    const issuer = `https://${teamDomain}`;

    const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { extractable: true });
    const pubJwk = await jose.exportJWK(publicKey);
    pubJwk.kid = 'kid-aud-arr';
    pubJwk.alg = 'RS256';
    pubJwk.use = 'sig';

    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'kid-aud-arr' })
      .setIssuer(issuer)
      .setAudience(['other', 'line-harness-admin'])
      .setExpirationTime('1h')
      .sign(privateKey);

    const fetchFn = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      expect(url).toBe(`https://${teamDomain}/cdn-cgi/access/certs`);
      expect(init?.redirect).toBe('error');
      return jwksJsonResponse({ keys: [pubJwk] });
    });

    const { verifyCloudflareAccessJwt } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    const r = await verifyCloudflareAccessJwt({
      jwt,
      teamDomain,
      expectedAudience: 'line-harness-admin',
      fetchFn,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects JWKS when Content-Type is not JSON', async () => {
    const teamDomain = 'testteam.cloudflareaccess.com';
    const issuer = `https://${teamDomain}`;
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { extractable: true });
    const pubJwk = await jose.exportJWK(publicKey);
    pubJwk.kid = 'kid-ct';
    pubJwk.alg = 'RS256';
    pubJwk.use = 'sig';

    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'kid-ct' })
      .setIssuer(issuer)
      .setExpirationTime('1h')
      .sign(privateKey);

    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ keys: [pubJwk] }), {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    const { verifyCloudflareAccessJwt } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    const r = await verifyCloudflareAccessJwt({ jwt, teamDomain, fetchFn });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/json/i);
  });

  it('rejects JWKS when response URL host does not match team domain', async () => {
    const teamDomain = 'testteam.cloudflareaccess.com';
    const issuer = `https://${teamDomain}`;
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { extractable: true });
    const pubJwk = await jose.exportJWK(publicKey);
    pubJwk.kid = 'kid-host';
    pubJwk.alg = 'RS256';
    pubJwk.use = 'sig';

    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'kid-host' })
      .setIssuer(issuer)
      .setExpirationTime('1h')
      .sign(privateKey);

    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jwksJsonResponse({ keys: [pubJwk] }, 'https://evil.test/cdn-cgi/access/certs'),
      );

    const { verifyCloudflareAccessJwt } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    const r = await verifyCloudflareAccessJwt({ jwt, teamDomain, fetchFn });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/hostname mismatch/i);
  });

  it('rejects JWKS with too many keys', async () => {
    const teamDomain = 'testteam.cloudflareaccess.com';
    const issuer = `https://${teamDomain}`;
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { extractable: true });
    const pubJwk = await jose.exportJWK(publicKey);
    pubJwk.kid = 'kid-many';
    pubJwk.alg = 'RS256';
    pubJwk.use = 'sig';

    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'kid-many' })
      .setIssuer(issuer)
      .setExpirationTime('1h')
      .sign(privateKey);

    const keys = Array.from({ length: 50 }, (_, i) => ({ ...pubJwk, kid: `k${i}` }));
    const fetchFn = vi.fn().mockResolvedValue(jwksJsonResponse({ keys }));

    const { verifyCloudflareAccessJwt } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    const r = await verifyCloudflareAccessJwt({ jwt, teamDomain, fetchFn });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/too large/i);
  });

  it('rejects when certs fetch fails due to redirect (redirect:error)', async () => {
    const teamDomain = 'testteam.cloudflareaccess.com';
    const issuer = `https://${teamDomain}`;
    const { privateKey } = await jose.generateKeyPair('RS256', { extractable: true });

    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'kid-redir' })
      .setIssuer(issuer)
      .setExpirationTime('1h')
      .sign(privateKey);

    const fetchFn = vi.fn().mockRejectedValue(new TypeError('redirect mode'));

    const { verifyCloudflareAccessJwt } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    const r = await verifyCloudflareAccessJwt({ jwt, teamDomain, fetchFn });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/fetch/i);
  });
});
