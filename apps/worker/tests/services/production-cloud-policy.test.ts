import { describe, expect, it } from 'vitest';
import {
  getProductionCloudSurfaceWarnings,
  isNonLocalHttpsWorkerUrl,
} from '../../src/services/production-cloud-policy.js';

describe('production-cloud-policy', () => {
  it('does not treat placeholder WORKER_URL as a deployed public HTTPS surface', () => {
    expect(isNonLocalHttpsWorkerUrl('https://YOUR_SUBDOMAIN.workers.dev')).toBe(false);
    expect(isNonLocalHttpsWorkerUrl('https://your_subdomain.workers.dev')).toBe(false);
  });

  it('warns on short or placeholder-like API_KEY', () => {
    const a = getProductionCloudSurfaceWarnings({ API_KEY: 'short' });
    expect(a.some((x) => x.includes('API_KEY') && x.includes('24'))).toBe(true);

    const b = getProductionCloudSurfaceWarnings({ API_KEY: 'local-dev-api-key-change-me' });
    expect(b.some((x) => x.toLowerCase().includes('placeholder'))).toBe(true);
  });

  it('warns when legacy Bearer API_KEY session is enabled', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      ALLOW_LEGACY_API_KEY_BEARER_SESSION: '1',
    });
    expect(w.some((x) => x.includes('ALLOW_LEGACY_API_KEY_BEARER_SESSION'))).toBe(true);
  });

  it('warns when public OpenAPI is explicitly enabled without disable override', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      ENABLE_PUBLIC_OPENAPI: '1',
    });
    expect(w.some((x) => x.includes('OpenAPI'))).toBe(true);
  });

  it('does not warn for OpenAPI when DISABLE_PUBLIC_OPENAPI is on', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      ENABLE_PUBLIC_OPENAPI: '1',
      DISABLE_PUBLIC_OPENAPI: '1',
    });
    expect(w.some((x) => x.includes('OpenAPI'))).toBe(false);
  });

  it('warns for workers.dev URL without Cloudflare Access enforcement', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://my-worker.subdomain.workers.dev',
    });
    expect(w.some((x) => x.includes('REQUIRE_CLOUDFLARE_ACCESS_JWT'))).toBe(true);
  });

  it('does not warn for workers.dev when Access is enforced', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://my-worker.subdomain.workers.dev',
      REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
    });
    expect(w.some((x) => x.includes('REQUIRE_CLOUDFLARE_ACCESS_JWT'))).toBe(false);
  });

  it('warns when MIN_CF_BOT_SCORE is unset and only rate limits defend login', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
    });
    expect(w.some((x) => x.includes('MIN_CF_BOT_SCORE'))).toBe(true);
  });

  it('does not repeat MIN_CF_BOT warning when score threshold is configured', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
      MIN_CF_BOT_SCORE: '30',
    });
    expect(w.some((x) => x.includes('MIN_CF_BOT_SCORE'))).toBe(false);
  });

  it('warns when host allowlist is unset on an https worker URL', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
    });
    expect(w.some((x) => x.includes('ALLOWED_HOSTNAMES'))).toBe(true);
  });

  it('does not warn ALLOWED_HOSTNAMES when set', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
      ALLOWED_HOSTNAMES: 'api.example.com',
    });
    expect(w.some((x) => x.includes('ALLOWED_HOSTNAMES is unset'))).toBe(false);
  });

  it('warns about admin session secret, broadcast send secret, and browser client token on https worker', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
    });
    expect(w.some((x) => x.includes('ADMIN_SESSION_SECRET is required'))).toBe(true);
    expect(w.some((x) => x.includes('BROADCAST_SEND_SECRET'))).toBe(true);
    expect(w.some((x) => x.includes('LINE_ACCOUNT_SECRETS_WRITE_SECRET'))).toBe(true);
    expect(w.some((x) => x.includes('MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID'))).toBe(
      false,
    );
    expect(w.some((x) => x.includes('ADMIN_BROWSER_CLIENT_TOKEN is unset'))).toBe(true);
  });

  it('warns about multi-account scoping when full HTTPS RELAX pair is active', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
      RELAX_DEPLOYED_SECURITY_DEFAULTS: '1',
      RELAX_DEPLOYED_SECURITY_CONFIRM: 'YES_I_ACCEPT_REDUCED_SECURITY',
    });
    expect(w.some((x) => x.includes('MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID'))).toBe(
      true,
    );
  });

  it('warns when RELAX is set on HTTPS without confirmation (strict defaults remain)', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
      RELAX_DEPLOYED_SECURITY_DEFAULTS: '1',
    });
    expect(w.some((x) => x.includes('incomplete'))).toBe(true);
    expect(w.some((x) => x.includes('RELAX_DEPLOYED_SECURITY_CONFIRM'))).toBe(true);
  });

  it('does not warn ADMIN_BROWSER_CLIENT_TOKEN when set or allow-default is on', () => {
    const withToken = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
      ADMIN_BROWSER_CLIENT_TOKEN: 'long-random-shared',
    });
    expect(withToken.some((x) => x.includes('ADMIN_BROWSER_CLIENT_TOKEN is unset'))).toBe(false);

    const withAllow = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
      ALLOW_DEFAULT_ADMIN_BROWSER_CLIENT: '1',
    });
    expect(withAllow.some((x) => x.includes('ADMIN_BROWSER_CLIENT_TOKEN is unset'))).toBe(false);
  });

  it('warns when ALLOW_LINE_ACCOUNT_SECRETS_PLAINTEXT_AT_REST is on', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
      ALLOW_LINE_ACCOUNT_SECRETS_PLAINTEXT_AT_REST: '1',
    });
    expect(w.some((x) => x.includes('ALLOW_LINE_ACCOUNT_SECRETS_PLAINTEXT_AT_REST'))).toBe(true);
  });

  it('does not warn admin session checklist when ADMIN_SESSION_SECRET is configured', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
      ADMIN_SESSION_SECRET: 'dedicated-session-hmac-secret-value',
    });
    expect(w.some((x) => x.includes('ADMIN_SESSION_SECRET is required'))).toBe(false);
  });

  it('warns when ALLOW_LEGACY_API_KEY_SESSION_SIGNER is on for an https worker URL', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
      ALLOW_LEGACY_API_KEY_SESSION_SIGNER: '1',
    });
    expect(w.some((x) => x.includes('ALLOW_LEGACY_API_KEY_SESSION_SIGNER'))).toBe(true);
  });

  it('warns when permissive tracking or LIFF OAuth fallback flags are on', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
      ALLOW_TRACKING_LINK_API_KEY_FALLBACK: '1',
      ALLOW_LIFF_OAUTH_API_KEY_FALLBACK: '1',
      ALLOW_BROADCAST_WITHOUT_SEND_SECRET: '1',
    });
    expect(w.some((x) => x.includes('ALLOW_TRACKING_LINK_API_KEY_FALLBACK'))).toBe(true);
    expect(w.some((x) => x.includes('ALLOW_LIFF_OAUTH_API_KEY_FALLBACK'))).toBe(true);
    expect(w.some((x) => x.includes('ALLOW_BROADCAST_WITHOUT_SEND_SECRET'))).toBe(true);
  });
});
