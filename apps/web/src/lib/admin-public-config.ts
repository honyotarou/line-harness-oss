/**
 * 管理画面（Next 静的）が参照する公開環境変数のみを集約する。
 * URL やフラグの読み取りを一箇所に閉じ、変更時の影響範囲を限定する。
 */

const DEFAULT_WORKER_API_ORIGIN = 'https://your_subdomain.workers.dev';

/** ブラウザが叩く Worker API のオリジン（`NEXT_PUBLIC_API_URL`）。 */
export function getAdminWorkerApiOrigin(): string {
  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_WORKER_API_ORIGIN;
}

/** Cloudflare Access 経由ログイン（POST login は空 JSON）。 */
export function isAdminCloudflareAccessLoginEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_USE_CLOUDFLARE_ACCESS_LOGIN?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** `validateClientApiBaseUrl` の本番プレースホルダー許可（開発のみ true）。 */
export function allowAdminApiUrlPlaceholderTemplate(): boolean {
  return process.env.NODE_ENV !== 'production';
}
