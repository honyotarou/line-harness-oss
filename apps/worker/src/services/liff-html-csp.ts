/**
 * Worker-served LIFF landing / error HTML uses inline script and style tags.
 * Applied only when `Content-Type` is HTML (see security-headers middleware).
 */
export const LIFF_WORKER_HTML_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self' https:",
  'upgrade-insecure-requests',
].join('; ');
