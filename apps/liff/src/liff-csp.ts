import { validateClientApiBaseUrl } from '@line-crm/shared/safe-api-base-url';

/** LIFF JS SDK fetches XLT manifest from this host (see browser console if connect-src is too tight). */
const LIFF_SDK_CONNECT = 'https://liffsdk.line-scdn.net';

export function buildLiffContentSecurityPolicy(apiBase: string): string {
  let connect = `'self' https://api.line.me ${LIFF_SDK_CONNECT}`;
  const v = validateClientApiBaseUrl(apiBase, { allowPlaceholderTemplate: false });
  if (v.ok) {
    connect = `'self' ${v.normalizedOrigin} https://api.line.me ${LIFF_SDK_CONNECT}`;
  }
  return [
    "default-src 'self'",
    "script-src 'self' https://static.line-scdn.net",
    "style-src 'self'",
    `connect-src ${connect}`,
    "img-src 'self' data: blob: https://*.line-scdn.net",
    "font-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'self' https://line.me https://liff.line.me",
    'upgrade-insecure-requests',
  ].join('; ');
}
