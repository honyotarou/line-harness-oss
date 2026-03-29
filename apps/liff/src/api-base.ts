/** Default API base when neither VITE_API_URL nor a valid browser origin is available. */
export const DEFAULT_LIFF_API_DEV = 'http://localhost:8787';

/**
 * Resolves the Worker API base URL for LIFF fetches.
 * Order: non-empty `VITE_API_URL` → `browserOrigin` if http(s) → dev default.
 */
export function resolveLiffApiBaseUrl(
  viteApiUrl: string | undefined,
  browserOrigin: string | null | undefined,
): string {
  const trimmed = typeof viteApiUrl === 'string' ? viteApiUrl.trim() : '';
  if (trimmed !== '') {
    return trimmed.replace(/\/+$/, '');
  }
  if (browserOrigin && /^https?:\/\//i.test(browserOrigin)) {
    return browserOrigin.replace(/\/+$/, '');
  }
  return DEFAULT_LIFF_API_DEV;
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
  return resolveLiffApiBaseUrl(env, origin ?? null);
}
