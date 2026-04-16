import { describe, expect, it } from 'vitest';
import {
  AUTH_API_REDIRECT_NOT_FOLLOWED_CODE,
  adminAuthFetchFailureBody,
  isBrowserAdminAuthApiPath,
  resolveBrowserFetchRedirectPolicy,
  shouldNormalizeAuthFetchNetworkFailure,
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
  it('uses redirect error for /api/auth/* so SSO login redirects are not followed', () => {
    expect(resolveBrowserFetchRedirectPolicy('/api/auth/session')).toBe('error');
    expect(resolveBrowserFetchRedirectPolicy('/api/auth/login', { redirect: 'follow' })).toBe(
      'error',
    );
  });

  it('honors caller redirect for non-auth paths', () => {
    expect(resolveBrowserFetchRedirectPolicy('/api/friends')).toBe('follow');
    expect(resolveBrowserFetchRedirectPolicy('/api/tags', { redirect: 'manual' })).toBe('manual');
  });
});

describe('shouldNormalizeAuthFetchNetworkFailure', () => {
  it('normalizes TypeError on auth paths only', () => {
    expect(shouldNormalizeAuthFetchNetworkFailure('/api/auth/session', new TypeError('fail'))).toBe(
      true,
    );
    expect(shouldNormalizeAuthFetchNetworkFailure('/api/friends', new TypeError('fail'))).toBe(
      false,
    );
    expect(shouldNormalizeAuthFetchNetworkFailure('/api/auth/session', new Error('other'))).toBe(
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
