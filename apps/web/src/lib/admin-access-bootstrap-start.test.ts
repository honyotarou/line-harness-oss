import { describe, expect, it } from 'vitest';
import { buildAdminAccessBootstrapStartHref } from './admin-access-bootstrap-start';

describe('buildAdminAccessBootstrapStartHref', () => {
  const saved = {
    base: process.env.NEXT_PUBLIC_ADMIN_BROWSER_API_BASE,
  };
  const reset = () => {
    if (saved.base === undefined) delete process.env.NEXT_PUBLIC_ADMIN_BROWSER_API_BASE;
    else process.env.NEXT_PUBLIC_ADMIN_BROWSER_API_BASE = saved.base;
  };

  it('builds default href for /login', () => {
    process.env.NEXT_PUBLIC_ADMIN_BROWSER_API_BASE = '/api/lh-upstream';
    expect(buildAdminAccessBootstrapStartHref()).toBe(
      '/api/lh-upstream/api/auth/access-bootstrap?returnTo=%2Flogin%3Faccess%3Dcomplete',
    );
    reset();
  });

  it('encodes returnTo', () => {
    process.env.NEXT_PUBLIC_ADMIN_BROWSER_API_BASE = '/api/lh-upstream';
    expect(buildAdminAccessBootstrapStartHref({ returnTo: '/friends?x=1' })).toBe(
      '/api/lh-upstream/api/auth/access-bootstrap?returnTo=%2Ffriends%3Fx%3D1',
    );
    reset();
  });

  it('supports explicit override (same-origin BFF path)', () => {
    expect(
      buildAdminAccessBootstrapStartHref({ browserApiFetchBase: '/api/proxy', returnTo: '/login' }),
    ).toBe('/api/proxy/api/auth/access-bootstrap?returnTo=%2Flogin');
  });

  it('supports absolute fetch base (direct Worker origin)', () => {
    expect(
      buildAdminAccessBootstrapStartHref({
        browserApiFetchBase: 'https://api.example.com',
        returnTo: '/login',
      }),
    ).toBe('https://api.example.com/api/auth/access-bootstrap?returnTo=%2Flogin');
  });
});
