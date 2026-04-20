import { describe, expect, it } from 'vitest';
import { buildAdminAccessSessionStartHref } from './admin-access-session-start';

describe('buildAdminAccessSessionStartHref', () => {
  it('builds default href for /login', () => {
    expect(buildAdminAccessSessionStartHref()).toBe(
      '/api/lh-upstream/api/auth/session?returnTo=%2Flogin',
    );
  });

  it('encodes returnTo', () => {
    expect(buildAdminAccessSessionStartHref({ returnTo: '/friends?x=1' })).toBe(
      '/api/lh-upstream/api/auth/session?returnTo=%2Ffriends%3Fx%3D1',
    );
  });

  it('supports custom bffPrefix', () => {
    expect(buildAdminAccessSessionStartHref({ bffPrefix: '/api/proxy', returnTo: '/login' })).toBe(
      '/api/proxy/api/auth/session?returnTo=%2Flogin',
    );
  });
});
