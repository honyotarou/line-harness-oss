import { resolveSafeRedirectUrl, type AllowedOriginsEnv } from '@line-crm/shared';

/** Vite env → same shape as Worker `LiffRedirectEnv` for redirect allowlisting. */
export function getLiffRedirectEnvFromVite(): AllowedOriginsEnv {
  return {
    WEB_URL: import.meta.env.VITE_WEB_URL as string | undefined,
    WORKER_URL:
      (import.meta.env.VITE_WORKER_URL as string | undefined) ||
      (import.meta.env.VITE_API_URL as string | undefined),
    LIFF_URL: import.meta.env.VITE_LIFF_URL as string | undefined,
    ALLOWED_ORIGINS: import.meta.env.VITE_ALLOWED_ORIGINS as string | undefined,
  };
}

/**
 * Safe `redirect` query value for post-login navigation (blocks javascript:, open redirects, etc.).
 */
export function getSafeRedirectFromCurrentUrl(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = new URLSearchParams(window.location.search).get('redirect');
  if (raw === null || raw.trim() === '') {
    return null;
  }
  return resolveSafeRedirectUrl(raw, getLiffRedirectEnvFromVite());
}
