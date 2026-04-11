import { describe, expect, it } from 'vitest';
import { getProductionCloudSurfaceWarnings } from '../../src/services/production-cloud-policy.js';

describe('production-cloud-policy', () => {
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

  it('warns about admin session secret, broadcast send secret, and multi-account scoping on https worker', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
    });
    expect(w.some((x) => x.includes('REQUIRE_ADMIN_SESSION_SECRET'))).toBe(true);
    expect(w.some((x) => x.includes('BROADCAST_SEND_SECRET'))).toBe(true);
    expect(w.some((x) => x.includes('MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID'))).toBe(
      true,
    );
  });

  it('does not warn admin session checklist when REQUIRE + ADMIN_SESSION_SECRET are configured', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
      REQUIRE_ADMIN_SESSION_SECRET: '1',
      ADMIN_SESSION_SECRET: 'dedicated-session-hmac-secret-value',
    });
    expect(w.some((x) => x.includes('REQUIRE_ADMIN_SESSION_SECRET=1'))).toBe(false);
  });

  it('warns when ALLOW_LEGACY_API_KEY_SESSION_SIGNER is on for an https worker URL', () => {
    const w = getProductionCloudSurfaceWarnings({
      API_KEY: 'x'.repeat(40),
      WORKER_URL: 'https://api.example.com',
      ALLOW_LEGACY_API_KEY_SESSION_SIGNER: '1',
    });
    expect(w.some((x) => x.includes('ALLOW_LEGACY_API_KEY_SESSION_SIGNER'))).toBe(true);
  });
});
