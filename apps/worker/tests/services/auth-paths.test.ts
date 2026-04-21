import { describe, expect, it } from 'vitest';
import {
  canonicalRequestPathname,
  isAuthExemptPath,
  isCloudflareAccessExemptPath,
  logicalAdminApiPathnameForPolicy,
} from '../../src/services/auth-paths.js';

describe('isAuthExemptPath', () => {
  it('treats webhook and stripe webhook as exempt', () => {
    expect(isAuthExemptPath('/webhook', 'POST')).toBe(true);
    expect(isAuthExemptPath('/api/integrations/stripe/webhook', 'POST')).toBe(true);
  });

  it('treats incoming webhook receive as exempt (exact shape; canonical dot-segments)', () => {
    expect(isAuthExemptPath('/api/webhooks/incoming/hook-1/receive', 'POST')).toBe(true);
    expect(isAuthExemptPath('/api/webhooks/../webhooks/incoming/hook-1/receive', 'POST')).toBe(
      true,
    );
    expect(isAuthExemptPath('/api/webhooks/incoming/hook-1/receive/extra', 'POST')).toBe(false);
    expect(isAuthExemptPath('/api/webhooks/incoming/hook-1', 'POST')).toBe(false);
  });

  it('treats GET form definition and POST submit as exempt', () => {
    expect(isAuthExemptPath('/api/forms/abc', 'GET')).toBe(true);
    expect(isAuthExemptPath('/api/forms/abc', 'PUT')).toBe(false);
    expect(isAuthExemptPath('/api/forms/abc/submit', 'POST')).toBe(true);
  });

  it('does not exempt admin-only analytics or link wrap (mounted with LIFF router but different path prefix)', () => {
    expect(isAuthExemptPath('/api/analytics/ref-summary', 'GET')).toBe(false);
    expect(isAuthExemptPath('/api/analytics/ref/promo', 'GET')).toBe(false);
    expect(isAuthExemptPath('/api/links/wrap', 'POST')).toBe(false);
  });

  it('treats /api/auth/login as exempt for bearer auth', () => {
    expect(isAuthExemptPath('/api/auth/login', 'POST')).toBe(true);
  });

  it('treats default BFF-prefixed /api/auth/* as exempt (same policy as stripped /api/...)', () => {
    expect(isAuthExemptPath('/api/lh-upstream/api/auth/session', 'GET')).toBe(true);
    expect(isAuthExemptPath('/api/lh-upstream/api/auth/login', 'POST')).toBe(true);
    expect(isAuthExemptPath('/api/lh-upstream/api/auth/access-bootstrap', 'GET')).toBe(true);
    expect(isAuthExemptPath('/api/lh-upstream/api/auth/access-bootstrap', 'POST')).toBe(false);
    expect(logicalAdminApiPathnameForPolicy('/api/lh-upstream/api/auth/session')).toBe(
      '/api/auth/session',
    );
  });

  it('does not strip BFF prefix when remainder is not an eligible admin proxy target', () => {
    expect(isAuthExemptPath('/api/lh-upstream/openapi.json', 'GET')).toBe(false);
    expect(logicalAdminApiPathnameForPolicy('/api/lh-upstream/openapi.json')).toBe(
      '/api/lh-upstream/openapi.json',
    );
  });

  it('does not apply BFF logical strip when ADMIN_INBOUND_BFF_PATH_PREFIX is empty', () => {
    const disabled = { ADMIN_INBOUND_BFF_PATH_PREFIX: '' } as const;
    expect(isAuthExemptPath('/api/lh-upstream/api/auth/session', 'GET', disabled)).toBe(false);
    expect(isCloudflareAccessExemptPath('/api/lh-upstream/api/auth/session', 'GET', disabled)).toBe(
      false,
    );
    expect(logicalAdminApiPathnameForPolicy('/api/lh-upstream/api/auth/session', disabled)).toBe(
      '/api/lh-upstream/api/auth/session',
    );
  });

  it('treats GET /favicon.ico as exempt (browser noise on Access-protected API hosts)', () => {
    expect(isAuthExemptPath('/favicon.ico', 'GET')).toBe(true);
    expect(isAuthExemptPath('/favicon.ico', 'POST')).toBe(false);
  });

  it('treats GET / as bearer-exempt (API host document navigation; no public route → 404)', () => {
    expect(isAuthExemptPath('/', 'GET')).toBe(true);
    expect(isAuthExemptPath('/', 'POST')).toBe(false);
  });

  it('does not exempt GET /api/_debug/env-probe (requires admin session when ALLOW_WORKER_ENV_PROBE)', () => {
    expect(isAuthExemptPath('/api/_debug/env-probe', 'GET')).toBe(false);
    expect(isAuthExemptPath('/api/_debug/env-probe', 'POST')).toBe(false);
  });

  it('does not treat encoded-slash traversal as /api/liff/ prefix (admin paths stay protected)', () => {
    expect(isAuthExemptPath('/api/liff%2f../links/wrap', 'POST')).toBe(false);
    expect(isAuthExemptPath('/api/liff%2F../analytics/ref-summary', 'GET')).toBe(false);
    expect(isAuthExemptPath('/api/liff/../links/wrap', 'POST')).toBe(false);
  });
});

describe('canonicalRequestPathname', () => {
  it('collapses dot segments on absolute paths', () => {
    expect(canonicalRequestPathname('/api/liff/../links/wrap')).toBe('/api/links/wrap');
    expect(canonicalRequestPathname('/api/forms/x/../y/submit')).toBe('/api/forms/y/submit');
  });
});

describe('isCloudflareAccessExemptPath', () => {
  it('does not exempt /api/auth/* while still exempting webhook', () => {
    expect(isCloudflareAccessExemptPath('/api/auth/login', 'POST')).toBe(false);
    expect(isCloudflareAccessExemptPath('/webhook', 'POST')).toBe(true);
  });

  it('does not exempt BFF-prefixed GET /api/auth/session (still requires Access JWT)', () => {
    expect(isCloudflareAccessExemptPath('/api/lh-upstream/api/auth/session', 'GET')).toBe(false);
  });

  it('does not exempt GET /api/auth/access-bootstrap (Access JWT still required)', () => {
    expect(isCloudflareAccessExemptPath('/api/auth/access-bootstrap', 'GET')).toBe(false);
    expect(isCloudflareAccessExemptPath('/api/lh-upstream/api/auth/access-bootstrap', 'GET')).toBe(
      false,
    );
  });

  it('does not exempt env-probe from Cloudflare Access (same as /api/auth/session)', () => {
    expect(isCloudflareAccessExemptPath('/api/_debug/env-probe', 'GET')).toBe(false);
  });

  it('exempts GET /favicon.ico from Cloudflare Access (matches auth exempt)', () => {
    expect(isCloudflareAccessExemptPath('/favicon.ico', 'GET')).toBe(true);
  });

  it('does not exempt GET / from Cloudflare Access (JWT still required when enforcement is on)', () => {
    expect(isCloudflareAccessExemptPath('/', 'GET')).toBe(false);
  });
});
