/**
 * Cloudflare Access の IdP ログインを完走させたあと、管理 UI へ戻すための「トップレベル遷移」用 URL。
 *
 * `GET /api/auth/access-bootstrap` は管理セッションを要せず 302 のみ返す（`returnTo` はサーバ側で検証）。
 * Access 未ログインならエッジが IdP へ誘導し、成功後に `CF_Authorization` が付いたうえで `/login` 等へ戻る。
 */

import { buildAdminAccessLoginCompleteReturnTo } from '@line-crm/shared';
import { getAdminBrowserApiFetchBase } from './admin-public-config';

export function buildAdminAccessBootstrapStartHref(params?: {
  returnTo?: string;
  /**
   * Override the browser API base.
   *
   * - When the admin UI is same-origin with `admin-access-proxy-worker`, this is typically a path
   *   like `/api/lh-upstream` (or an absolute URL ending with it).
   * - Otherwise, this is the upstream Worker origin like `https://api.example.com`.
   */
  browserApiFetchBase?: string;
}): string {
  const returnTo = params?.returnTo ?? buildAdminAccessLoginCompleteReturnTo('/login');
  const baseRaw = (params?.browserApiFetchBase ?? getAdminBrowserApiFetchBase()).replace(
    /\/+$/,
    '',
  );
  const path = `/api/auth/access-bootstrap?returnTo=${encodeURIComponent(returnTo)}`;
  if (/^https?:\/\//i.test(baseRaw)) {
    return `${baseRaw}${path}`;
  }
  const base = baseRaw.startsWith('/') ? baseRaw : `/${baseRaw}`;
  return `${base}${path}`;
}
