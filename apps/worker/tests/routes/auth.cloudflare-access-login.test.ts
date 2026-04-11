import { Hono } from 'hono';
import * as jose from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudflareAccessMiddleware } from '../../src/middleware/cloudflare-access.js';
import { authRoutes } from '../../src/routes/auth.js';
import type { Env } from '../../src/index.js';

const teamDomain = 'testteam.cloudflareaccess.com';

function cfAccessEnv(overrides: Partial<Env['Bindings']> = {}): Env['Bindings'] {
  return {
    DB: {} as D1Database,
    LINE_CHANNEL_SECRET: 'x',
    LINE_CHANNEL_ACCESS_TOKEN: 'x',
    API_KEY: 'root-api-key',
    LIFF_URL: 'https://liff.line.me/x',
    LINE_CHANNEL_ID: 'x',
    LINE_LOGIN_CHANNEL_ID: 'x',
    LINE_LOGIN_CHANNEL_SECRET: 'x',
    WORKER_URL: 'https://example.workers.dev',
    REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: teamDomain,
    ...overrides,
  } as Env['Bindings'];
}

async function signCfAccessJwt(claims: { email?: string }): Promise<string> {
  const issuer = `https://${teamDomain}`;
  const { privateKey, publicKey } = await jose.generateKeyPair('RS256', { extractable: true });
  const pubJwk = await jose.exportJWK(publicKey);
  pubJwk.kid = 'cf-access-login-test-kid';
  pubJwk.alg = 'RS256';
  pubJwk.use = 'sig';

  const jwt = await new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'cf-access-login-test-kid' })
    .setIssuer(issuer)
    .setAudience('test-aud')
    .setExpirationTime('1h')
    .sign(privateKey);

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      expect(url).toBe(`https://${teamDomain}/cdn-cgi/access/certs`);
      return new Response(JSON.stringify({ keys: [pubJwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return jwt;
}

describe('auth login with Cloudflare Access enforced', () => {
  beforeEach(async () => {
    const { resetRequestRateLimits } = await import('../../src/services/request-rate-limit.js');
    resetRequestRateLimits();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    const { resetCloudflareAccessJwksCacheForTests } = await import(
      '../../src/services/cloudflare-access-jwt.js'
    );
    resetCloudflareAccessJwksCacheForTests();
  });

  it('issues an admin session with empty JSON body when JWT is valid', async () => {
    const jwt = await signCfAccessJwt({ email: 'admin@example.com' });

    const app = new Hono<Env>();
    app.use('*', cloudflareAccessMiddleware);
    app.route('/', authRoutes);

    const response = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': jwt,
        },
        body: JSON.stringify({}),
      }),
      cfAccessEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('lh_admin_session=');
    const json = (await response.json()) as {
      success: boolean;
      data?: { expiresAt: string; sessionToken: string; email?: string };
    };
    expect(json.success).toBe(true);
    expect(json.data?.sessionToken).toBeTruthy();
    expect(json.data?.email).toBe('admin@example.com');
  });

  it('rejects apiKey in body when Access is enforced', async () => {
    const jwt = await signCfAccessJwt({ email: 'admin@example.com' });

    const app = new Hono<Env>();
    app.use('*', cloudflareAccessMiddleware);
    app.route('/', authRoutes);

    const response = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': jwt,
        },
        body: JSON.stringify({ apiKey: 'root-api-key' }),
      }),
      cfAccessEnv(),
    );

    expect(response.status).toBe(400);
    const json = (await response.json()) as { success: boolean; error?: string };
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/apiKey must not be sent/i);
  });

  it('returns 401 without middleware payload when enforcement is on (misconfiguration)', async () => {
    const app = new Hono<Env>();
    app.route('/', authRoutes);

    const response = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      cfAccessEnv(),
    );

    expect(response.status).toBe(401);
    const json = (await response.json()) as { success: boolean; error?: string };
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Access JWT missing/i);
  });
});
