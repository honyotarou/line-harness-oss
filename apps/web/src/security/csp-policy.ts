import { validateAdminApiFetchBase } from '@line-crm/shared';

/**
 * CSP for the exported admin static app (see `vercel.json`) and for `next dev` / Playwright.
 * - `unsafe-eval` is required for Next.js dev tooling; production export omits it.
 * - `script-src 'unsafe-inline'` is still required for Next.js App Router flight payload (`self.__next_f`)
 *   in static export; removing it breaks the admin UI.
 * - `img-src` avoids blanket `https:` (reduces exfiltration via `<img>`); LINE avatars use *.line-scdn.net.
 * - `worker-src 'none'` / `media-src 'self'` tighten the surface without affecting the static export bundle.
 * - `connect-src`: `vercel.json` keeps `https:` because headers are static. `next dev` may pass
 *   `narrowConnectSrcFromApiUrl` (build-time `NEXT_PUBLIC_API_URL`) to restrict fetch targets when the URL
 *   validates as a non-placeholder origin.
 */
/** Cloudflare Web Analytics / Insights beacon (browser RUM). */
const CLOUDFLARE_INSIGHTS_CONNECT = 'https://cloudflareinsights.com';

function connectSrcDirective(narrowApiUrl?: string): string {
  const trimmed = narrowApiUrl?.trim();
  if (trimmed) {
    const v = validateAdminApiFetchBase(trimmed, { allowPlaceholderTemplate: false });
    if (v.ok) {
      return `connect-src 'self' ${v.origin} ${CLOUDFLARE_INSIGHTS_CONNECT}`;
    }
  }
  return "connect-src 'self' https:";
}

export function buildAdminContentSecurityPolicy(options: {
  allowUnsafeEval: boolean;
  /** When set to a valid, non-placeholder API origin, narrows `connect-src` (used in `next dev` / CI). */
  narrowConnectSrcFromApiUrl?: string;
}): string {
  const cfInsightsScript = ' https://static.cloudflareinsights.com';
  const scriptSrc = options.allowUnsafeEval
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'${cfInsightsScript}`
    : `script-src 'self' 'unsafe-inline'${cfInsightsScript}`;
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "media-src 'self'",
    "manifest-src 'self'",
    scriptSrc,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.line-scdn.net",
    "font-src 'self' data:",
    connectSrcDirective(options.narrowConnectSrcFromApiUrl),
    'upgrade-insecure-requests',
  ].join('; ');
}
