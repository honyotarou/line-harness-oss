import { describe, expect, it } from 'vitest';
import {
  AUTH_API_REDIRECT_NOT_FOLLOWED_CODE,
  adminAuthFetchFailureBody,
  isBrowserAdminAuthApiPath,
  isBrowserAdminManagedApiPath,
  resolveBrowserFetchRedirectPolicy,
  shouldTreatBrowserAdminApiResponseAsAccessEdgeRedirect,
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

describe('isBrowserAdminManagedApiPath', () => {
  it('is true for any /api/* path', () => {
    expect(isBrowserAdminManagedApiPath('/api/auth/session')).toBe(true);
    expect(isBrowserAdminManagedApiPath('/api/friends')).toBe(true);
    expect(isBrowserAdminManagedApiPath('/api/')).toBe(true);
    expect(isBrowserAdminManagedApiPath('/api')).toBe(false);
    expect(isBrowserAdminManagedApiPath('/v1/api/foo')).toBe(false);
  });
});

describe('resolveBrowserFetchRedirectPolicy', () => {
  it('uses redirect manual for all /api/* so edge login redirects are not auto-followed', () => {
    expect(resolveBrowserFetchRedirectPolicy('/api/auth/session')).toBe('manual');
    expect(resolveBrowserFetchRedirectPolicy('/api/auth/login', { redirect: 'follow' })).toBe(
      'manual',
    );
    expect(resolveBrowserFetchRedirectPolicy('/api/friends')).toBe('manual');
    expect(resolveBrowserFetchRedirectPolicy('/api/tags', { redirect: 'follow' })).toBe('manual');
  });

  it('honors caller redirect only for non-/api paths', () => {
    expect(resolveBrowserFetchRedirectPolicy('/p')).toBe('follow');
    expect(resolveBrowserFetchRedirectPolicy('/p', { redirect: 'manual' })).toBe('manual');
  });
});

describe('shouldTreatBrowserAdminApiResponseAsAccessEdgeRedirect', () => {
  it('is false for opaqueredirect (no Location; avoid replace("/") loops)', () => {
    expect(
      shouldTreatBrowserAdminApiResponseAsAccessEdgeRedirect({
        type: 'opaqueredirect',
        status: 0,
      } as Response),
    ).toBe(false);
  });

  it('is true when Location targets Cloudflare Access login', () => {
    expect(
      shouldTreatBrowserAdminApiResponseAsAccessEdgeRedirect(
        new Response(null, {
          status: 302,
          headers: {
            Location:
              'https://team.cloudflareaccess.com/cdn-cgi/access/login/example.com?redirect=/api/x',
          },
        }),
      ),
    ).toBe(true);
  });

  it('is false for 302 without Access-shaped Location', () => {
    expect(
      shouldTreatBrowserAdminApiResponseAsAccessEdgeRedirect(
        new Response(null, { status: 302, headers: { Location: '/somewhere' } }),
      ),
    ).toBe(false);
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
