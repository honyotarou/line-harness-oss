/**
 * Browser `fetch` policy for admin **session/cookie auth API** (`/api/auth/*`).
 * Some deployments place an edge SSO in front of the API; unauthenticated calls may return
 * **302 to an IdP login host**. Following that redirect from `fetch` breaks JSON clients
 * (cross-origin CORS, wrong MIME for `<script>`-like expectations in debugging).
 *
 * Use `redirect: 'manual'` (WHATWG Fetch) so we can detect redirects without following them;
 * do **not** map every `TypeError` to an auth error — CORS and DNS failures also throw `TypeError`.
 */

const ADMIN_AUTH_PATH_PREFIX = '/api/auth/';

export const AUTH_API_REDIRECT_NOT_FOLLOWED_CODE = 'AUTH_API_REDIRECT_NOT_FOLLOWED' as const;

export function isBrowserAdminAuthApiPath(path: string): boolean {
  return path.startsWith(ADMIN_AUTH_PATH_PREFIX);
}

/**
 * `redirect: 'manual'` for `/api/auth/*` so redirects are not auto-followed; `follow` elsewhere.
 * @see https://fetch.spec.whatwg.org/#dom-requestinit-redirect
 */
export function resolveBrowserFetchRedirectPolicy(
  path: string,
  options?: RequestInit,
): RequestRedirect {
  if (isBrowserAdminAuthApiPath(path)) {
    return 'manual';
  }
  return (options?.redirect as RequestRedirect | undefined) ?? 'follow';
}

/** True when the response is a redirect the browser did not follow (SSO / edge login). */
export function shouldTreatBrowserAuthResponseAsSsoRedirect(res: Response): boolean {
  if (res.type === 'opaqueredirect') {
    return true;
  }
  return res.status >= 300 && res.status < 400;
}

/** JSON body attached to synthetic `ApiError` (see `createApiError`) for operator-facing UI. */
export function adminAuthFetchFailureBody(): {
  error: string;
  code: typeof AUTH_API_REDIRECT_NOT_FOLLOWED_CODE;
} {
  return {
    code: AUTH_API_REDIRECT_NOT_FOLLOWED_CODE,
    error:
      '認証 API がログインページへリダイレクトしています。ブラウザの fetch がそれを追従すると別オリジンで失敗することがあります。エッジ SSO では認証 API を JSON で返すか、静的アセットと同様にパス単位のポリシーを分けてください。',
  };
}
