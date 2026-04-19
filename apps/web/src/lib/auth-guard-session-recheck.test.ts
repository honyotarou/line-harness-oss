import { describe, expect, it } from 'vitest';
import { shouldAuthGuardBlockUiForSessionRecheck } from './auth-guard-session-recheck';

describe('shouldAuthGuardBlockUiForSessionRecheck', () => {
  it('blocks UI on first app load (no previous path)', () => {
    expect(
      shouldAuthGuardBlockUiForSessionRecheck({ pathname: '/friends', previousPathname: null }),
    ).toBe(true);
  });

  it('blocks UI when returning from login into the app', () => {
    expect(
      shouldAuthGuardBlockUiForSessionRecheck({ pathname: '/friends', previousPathname: '/login' }),
    ).toBe(true);
  });

  it('does not block UI on in-app navigation', () => {
    expect(
      shouldAuthGuardBlockUiForSessionRecheck({
        pathname: '/broadcasts',
        previousPathname: '/friends',
      }),
    ).toBe(false);
  });

  it('does not block on login route', () => {
    expect(
      shouldAuthGuardBlockUiForSessionRecheck({ pathname: '/login', previousPathname: '/friends' }),
    ).toBe(false);
  });

  it('treats null pathname like a non-login route for block logic', () => {
    expect(
      shouldAuthGuardBlockUiForSessionRecheck({ pathname: null, previousPathname: '/friends' }),
    ).toBe(false);
    expect(
      shouldAuthGuardBlockUiForSessionRecheck({ pathname: null, previousPathname: null }),
    ).toBe(true);
  });
});
