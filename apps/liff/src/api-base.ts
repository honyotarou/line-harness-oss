/**
 * LIFF → Worker の HTTP クライアントが参照する API オリジン。
 * 解決ルール本体は `config/liff-api-origin.ts` に閉じる。
 */
export {
  DEFAULT_LIFF_API_FALLBACK,
  isLineHostedLiffPageOrigin,
  readMetaLhApiBase,
  resolveLiffApiBaseUrl,
} from './config/liff-api-origin.js';

import { readMetaLhApiBase, resolveLiffApiBaseUrl } from './config/liff-api-origin.js';

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
