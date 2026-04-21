/**
 * Cloudflare Access の IdP ログインを完走させたあと、管理 UI へ戻すための「トップレベル遷移」用 URL。
 *
 * `GET /api/auth/access-bootstrap` は管理セッションを要せず 302 のみ返す（`returnTo` はサーバ側で検証）。
 * Access 未ログインならエッジが IdP へ誘導し、成功後に `CF_Authorization` が付いたうえで `/login` 等へ戻る。
 */

const DEFAULT_BFF_PREFIX = '/api/lh-upstream';

export function buildAdminAccessBootstrapStartHref(params?: {
  returnTo?: string;
  bffPrefix?: string;
}): string {
  const returnTo = params?.returnTo ?? '/login';
  const prefix = (params?.bffPrefix ?? DEFAULT_BFF_PREFIX).replace(/\/+$/, '');
  const base = prefix.startsWith('/') ? prefix : `/${prefix}`;
  return `${base}/api/auth/access-bootstrap?returnTo=${encodeURIComponent(returnTo)}`;
}
