/**
 * Hop-by-hop request header names (lowercase) to strip before forwarding upstream.
 * @see RFC 7230 §6.1 — prevents forwarding client hop headers to the origin.
 */
export const STRIP_REQUEST_HOP_BY_HOP_HEADERS = new Set(
  [
    'cf-connecting-ip',
    'cf-ray',
    'cf-visitor',
    'cf-access-client-id',
    'cf-access-client-secret',
    'cf-access-jwt-assertion',
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'host',
    'content-length',
  ].map((s) => s.toLowerCase()),
);
