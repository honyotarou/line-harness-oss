/** Default API base when neither VITE_API_URL nor a valid browser origin is available. */
export const DEFAULT_LIFF_API_DEV = 'http://localhost:8787';

/** LINE がホストする LIFF ページのオリジン。ここでは Worker の `/api` は存在しないため API ベースに使わない。 */
export function isLineHostedLiffPageOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === 'liff.line.me' || host === 'access.line.me';
  } catch {
    return false;
  }
}

/**
 * Resolves the Worker API base URL for LIFF fetches.
 * Order: non-empty `VITE_API_URL` → `<meta name="lh-api-base">`（ビルド時注入）→
 * 同一オリジンが Worker のときだけ `browserOrigin` → dev default。
 */
export function resolveLiffApiBaseUrl(
  viteApiUrl: string | undefined,
  browserOrigin: string | null | undefined,
  metaApiBase?: string | null | undefined,
): string {
  const trimmed = typeof viteApiUrl === 'string' ? viteApiUrl.trim() : '';
  if (trimmed !== '') {
    return trimmed.replace(/\/+$/, '');
  }
  const meta = typeof metaApiBase === 'string' ? metaApiBase.trim() : '';
  if (meta !== '' && /^https?:\/\//i.test(meta)) {
    return meta.replace(/\/+$/, '');
  }
  if (
    browserOrigin &&
    /^https?:\/\//i.test(browserOrigin) &&
    !isLineHostedLiffPageOrigin(browserOrigin)
  ) {
    return browserOrigin.replace(/\/+$/, '');
  }
  return DEFAULT_LIFF_API_DEV;
}

function readMetaLhApiBase(): string | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector('meta[name="lh-api-base"]');
  const c = el?.getAttribute('content')?.trim();
  if (!c || c.includes('%')) return null;
  if (!/^https?:\/\//i.test(c)) return null;
  return c;
}

export function getLiffApiBaseUrl(): string {
  const env = import.meta.env?.VITE_API_URL as string | undefined;
  let origin: string | undefined;
  try {
    if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
      const loc = (globalThis as Window & typeof globalThis).location;
      origin = loc?.origin;
    }
  } catch {
    /* opaque origin or restricted access */
  }
  return resolveLiffApiBaseUrl(env, origin ?? null, readMetaLhApiBase());
}
