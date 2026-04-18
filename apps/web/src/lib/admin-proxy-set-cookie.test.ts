import { describe, expect, it } from 'vitest';
import { rewriteSetCookieLineForAdminBrowserOrigin } from '@line-crm/shared';

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
