/**
 * Worker-served LIFF landing / error HTML uses inline script and style tags.
 * Applied only when `Content-Type` is HTML (see security-headers middleware).
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createWorkerHtmlCspNonce(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Nonce-based CSP for Worker-rendered HTML (LIFF pages, short-link landing, etc).
 * Avoids `unsafe-inline` while keeping the template static and self-contained.
 */
export function buildWorkerHtmlContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https:",
    'upgrade-insecure-requests',
  ].join('; ');
}
