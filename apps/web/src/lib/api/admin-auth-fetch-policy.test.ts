import { describe, expect, it } from 'vitest';
import {
  AUTH_API_REDIRECT_NOT_FOLLOWED_CODE,
  adminAuthFetchFailureBody,
  isBrowserAdminAuthApiPath,
  resolveBrowserFetchRedirectPolicy,
  shouldTreatBrowserAuthResponseAsSsoRedirect,
} from './admin-auth-fetch-policy';

describe('isBrowserAdminAuthApiPath', () => {
  it('is true only for /api/auth/*', () => {
    expect(isBrowserAdminAuthApiPath('/api/auth/session')).toBe(true);
    expect(isBrowserAdminAuthApiPath('/api/auth/login')).toBe(true);
    expect(isBrowserAdminAuthApiPath('/api/friends')).toBe(false);
    expect(isBrowserAdminAuthApiPath('/api/authx/foo')).toBe(false);
  });
});

describe('resolveBrowserFetchRedirectPolicy', () => {
  it('uses redirect manual for /api/auth/* so redirects are not auto-followed', () => {
    expect(resolveBrowserFetchRedirectPolicy('/api/auth/session')).toBe('manual');
    expect(resolveBrowserFetchRedirectPolicy('/api/auth/login', { redirect: 'follow' })).toBe(
      'manual',
    );
  });

  it('honors caller redirect for non-auth paths', () => {
    expect(resolveBrowserFetchRedirectPolicy('/api/friends')).toBe('follow');
    expect(resolveBrowserFetchRedirectPolicy('/api/tags', { redirect: 'manual' })).toBe('manual');
  });
});

describe('shouldTreatBrowserAuthResponseAsSsoRedirect', () => {
  it('is true for opaqueredirect', () => {
    expect(
      shouldTreatBrowserAuthResponseAsSsoRedirect({
        type: 'opaqueredirect',
        status: 0,
      } as Response),
    ).toBe(true);
  });

  it('is true for 3xx', () => {
    expect(shouldTreatBrowserAuthResponseAsSsoRedirect(new Response(null, { status: 302 }))).toBe(
      true,
    );
  });

  it('is false for 401 and 200', () => {
    expect(shouldTreatBrowserAuthResponseAsSsoRedirect(new Response('{}', { status: 401 }))).toBe(
      false,
    );
    expect(shouldTreatBrowserAuthResponseAsSsoRedirect(new Response('{}', { status: 200 }))).toBe(
      false,
    );
  });
});

describe('adminAuthFetchFailureBody', () => {
  it('returns a stable machine-oriented shape for UI', () => {
    const b = adminAuthFetchFailureBody();
    expect(b).toMatchObject({
      error: expect.stringMatching(/リダイレクト/),
      code: AUTH_API_REDIRECT_NOT_FOLLOWED_CODE,
    });
  });
});
