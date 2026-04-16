/**
 * Browser `fetch` policy for admin **session/cookie auth API** (`/api/auth/*`).
 * Some deployments place an edge SSO in front of the API; unauthenticated calls may return
 * **302 to an IdP login host**. Following that redirect from `fetch` breaks JSON clients
 * (cross-origin CORS, wrong MIME for `<script>`-like expectations in debugging).
 */

const ADMIN_AUTH_PATH_PREFIX = '/api/auth/';

export const AUTH_API_REDIRECT_NOT_FOLLOWED_CODE = 'AUTH_API_REDIRECT_NOT_FOLLOWED' as const;

export function isBrowserAdminAuthApiPath(path: string): boolean {
  return path.startsWith(ADMIN_AUTH_PATH_PREFIX);
}

export function resolveBrowserFetchRedirectPolicy(
  path: string,
  options?: RequestInit,
): RequestRedirect {
  if (isBrowserAdminAuthApiPath(path)) {
    return 'error';
  }
  return (options?.redirect as RequestRedirect | undefined) ?? 'follow';
}

export function shouldNormalizeAuthFetchNetworkFailure(path: string, error: unknown): boolean {
  return isBrowserAdminAuthApiPath(path) && error instanceof TypeError;
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
