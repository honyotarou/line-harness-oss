/**
 * Cloudflare Access の IdP ログインを完走させるための「トップレベル遷移」用 URL。
 *
 * `fetch()` で `/api/auth/login` を叩くと Access が 302 を返すことがあり、
 * ブラウザがクロスオリジンへ追従できず CORS で失敗するため、`<a href>` を使う。
 *
 * 同一オリジン BFF (`/api/lh-upstream/*`) 経由で `/api/auth/session` を開くと、
 * Access が未ログインなら IdP に誘導し、成功後に `CF_Authorization` が保存される。
 */

const DEFAULT_BFF_PREFIX = '/api/lh-upstream';

export function buildAdminAccessSessionStartHref(params?: {
  returnTo?: string;
  bffPrefix?: string;
}): string {
  const returnTo = params?.returnTo ?? '/login';
  const prefix = (params?.bffPrefix ?? DEFAULT_BFF_PREFIX).replace(/\/+$/, '');
  const base = prefix.startsWith('/') ? prefix : `/${prefix}`;
  return `${base}/api/auth/session?returnTo=${encodeURIComponent(returnTo)}`;
}
