/**
 * LIFF が Worker API に接続するオリジンの解決（Vite / meta / ブラウザ）。
 * fetch や画面からは `../api-base.js` 経由で使い、このモジュールは環境差分のカプセル化用。
 */
import { validateClientApiBaseUrl } from '@line-crm/shared/safe-api-base-url';

/** Fallback when `VITE_API_URL` / meta / origin are unavailable; set `VITE_API_URL` to your `*.workers.dev` Worker. */
export const DEFAULT_LIFF_API_FALLBACK = 'https://your_subdomain.workers.dev';

/** LINE がホストする LIFF ページのオリジン。Worker の `/api` は存在しないため API ベースに使わない。 */
export function isLineHostedLiffPageOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === 'liff.line.me' || host === 'access.line.me';
  } catch {
    return false;
  }
}

function finalizeLiffApiCandidate(candidate: string): string {
  const isProd = import.meta.env.PROD;
  const validated = validateClientApiBaseUrl(candidate, {
    allowPlaceholderTemplate: !isProd,
  });
  if (validated.ok) {
    return validated.normalizedOrigin;
  }
  if (isProd) {
    throw new Error(`Invalid LIFF API base URL: ${validated.reason}`);
  }
  console.warn(`[line-harness liff] API base URL rejected: ${validated.reason}`);
  return DEFAULT_LIFF_API_FALLBACK;
}

/**
 * Worker API ベース URL を決定する。
 * Order: `VITE_API_URL` → `<meta name="lh-api-base">` → 同一オリジン（LINE ホスト以外）→ プレースホルダ。
 */
export function resolveLiffApiBaseUrl(
  viteApiUrl: string | undefined,
  browserOrigin: string | null | undefined,
  metaApiBase?: string | null | undefined,
): string {
  const trimmed = typeof viteApiUrl === 'string' ? viteApiUrl.trim() : '';
  if (trimmed !== '') {
    return finalizeLiffApiCandidate(trimmed.replace(/\/+$/, ''));
  }
  const meta = typeof metaApiBase === 'string' ? metaApiBase.trim() : '';
  if (meta !== '' && /^https?:\/\//i.test(meta)) {
    return finalizeLiffApiCandidate(meta.replace(/\/+$/, ''));
  }
  if (
    browserOrigin &&
    /^https?:\/\//i.test(browserOrigin) &&
    !isLineHostedLiffPageOrigin(browserOrigin)
  ) {
    return finalizeLiffApiCandidate(browserOrigin.replace(/\/+$/, ''));
  }
  return finalizeLiffApiCandidate(DEFAULT_LIFF_API_FALLBACK);
}

export function readMetaLhApiBase(): string | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector('meta[name="lh-api-base"]');
  const c = el?.getAttribute('content')?.trim();
  if (!c || c.includes('%')) return null;
  if (!/^https?:\/\//i.test(c)) return null;
  return c;
}
