import { describe, expect, it } from 'vitest';
import {
  rewriteSetCookieLineForAdminBrowserOrigin,
  shouldForwardSetCookieLineToAdminBrowserOrigin,
  stripCloudflareCookiesFromCookieHeader,
} from '@line-crm/shared';

describe('rewriteSetCookieLineForAdminBrowserOrigin', () => {
  it('strips Domain and forces Path=/ for host-scoped admin cookies', () => {
    const line =
      'lh_admin_session=abc.def; HttpOnly; Secure; SameSite=None; Path=/api; Domain=line-crm-api.example.workers.dev';
    expect(rewriteSetCookieLineForAdminBrowserOrigin(line)).toBe(
      'lh_admin_session=abc.def; HttpOnly; Secure; SameSite=None; Path=/',
    );
  });

  it('keeps name=value only when no attributes', () => {
    expect(rewriteSetCookieLineForAdminBrowserOrigin('x=1')).toBe('x=1; Path=/');
  });
});

describe('shouldForwardSetCookieLineToAdminBrowserOrigin', () => {
  it('blocks Cloudflare-managed CF_* cookies', () => {
    expect(
      shouldForwardSetCookieLineToAdminBrowserOrigin(
        'CF_Authorization=abc; Secure; HttpOnly; SameSite=None; Path=/',
      ),
    ).toBe(false);
    expect(
      shouldForwardSetCookieLineToAdminBrowserOrigin('CF_AppSession=x; Path=/; Secure; HttpOnly'),
    ).toBe(false);
  });

  it('allows app-owned cookies like lh_admin_session', () => {
    expect(
      shouldForwardSetCookieLineToAdminBrowserOrigin(
        'lh_admin_session=abc.def; HttpOnly; Secure; SameSite=None; Path=/',
      ),
    ).toBe(true);
  });
});

describe('stripCloudflareCookiesFromCookieHeader', () => {
  it('removes CF_* from Cookie header before forwarding upstream', () => {
    expect(
      stripCloudflareCookiesFromCookieHeader(
        'CF_Authorization=a; lh_admin_session=s; CF_Device=x; other=1',
      ),
    ).toBe('lh_admin_session=s; other=1');
  });
});
