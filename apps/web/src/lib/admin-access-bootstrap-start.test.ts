import { describe, expect, it } from 'vitest';
import { buildAdminAccessBootstrapStartHref } from './admin-access-bootstrap-start';

describe('buildAdminAccessBootstrapStartHref', () => {
  it('builds default href for /login', () => {
    expect(buildAdminAccessBootstrapStartHref()).toBe(
      '/api/lh-upstream/api/auth/access-bootstrap?returnTo=%2Flogin',
    );
  });

  it('encodes returnTo', () => {
    expect(buildAdminAccessBootstrapStartHref({ returnTo: '/friends?x=1' })).toBe(
      '/api/lh-upstream/api/auth/access-bootstrap?returnTo=%2Ffriends%3Fx%3D1',
    );
  });

  it('supports custom bffPrefix', () => {
    expect(
      buildAdminAccessBootstrapStartHref({ bffPrefix: '/api/proxy', returnTo: '/login' }),
    ).toBe('/api/proxy/api/auth/access-bootstrap?returnTo=%2Flogin');
  });
});
