/**
 * Browser `fetch` policy for the **admin Worker API** (`/api/*`).
 *
 * Cloudflare Access (or similar) in front of `/api/lh-upstream/*` may return **302 to
 * `*.cloudflareaccess.com`** without CORS headers; following that from `fetch` surfaces as a CORS
 * error. Use `redirect: 'manual'` for **all** `/api/*` so we can detect redirects.
 *
 * `/api/auth/*`: `fetchApiCore` uses **`location.replace(href)`** / reload gate (see client).
 * Other `/api/*`: on **Access-shaped** redirects only, **`location.replace('/')`** so a full
 * document load can complete Access login (`redirect_url` matches the app root).
 *
 * When `window` is unavailable (e.g. Vitest node), callers still get a synthetic `ApiError`.
 *
 * Do **not** map every `TypeError` to an auth error — CORS and DNS failures also throw `TypeError`.
 */

const ADMIN_API_PATH_PREFIX = '/api/';
const ADMIN_AUTH_PATH_PREFIX = '/api/auth/';

export const AUTH_API_REDIRECT_NOT_FOLLOWED_CODE = 'AUTH_API_REDIRECT_NOT_FOLLOWED' as const;

/** True for any browser admin API path (`/api/...`), including `/api/auth/*`. */
export function isBrowserAdminManagedApiPath(path: string): boolean {
  return path.startsWith(ADMIN_API_PATH_PREFIX);
}

export function isBrowserAdminAuthApiPath(path: string): boolean {
  return path.startsWith(ADMIN_AUTH_PATH_PREFIX);
}

/**
 * `redirect: 'manual'` for `/api/*` so edge login redirects are not auto-followed.
 * @see https://fetch.spec.whatwg.org/#dom-requestinit-redirect
 */
export function resolveBrowserFetchRedirectPolicy(
  path: string,
  options?: RequestInit,
): RequestRedirect {
  if (isBrowserAdminManagedApiPath(path)) {
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

/**
 * For non-`/api/auth/*` admin calls: treat as Access edge login only when the redirect target
 * looks like Cloudflare Access (avoid hijacking normal API 302s).
 */
export function shouldTreatBrowserAdminApiResponseAsAccessEdgeRedirect(res: Response): boolean {
  if (res.type === 'opaqueredirect') {
    return true;
  }
  if (res.status < 300 || res.status >= 400) {
    return false;
  }
  const loc = res.headers?.get('Location')?.trim() ?? '';
  if (!loc) {
    return false;
  }
  if (/cloudflareaccess\.com/i.test(loc) || /\/cdn-cgi\/access\/login\//i.test(loc)) {
    return true;
  }
  try {
    return new URL(loc).hostname.includes('cloudflareaccess.com');
  } catch {
    return false;
  }
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
