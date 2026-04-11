/**
 * Mask signing secrets in JSON list responses (limits XSS / log exfil of full HMAC keys).
 * Create/update flows still accept full secrets; only GET list shapes are redacted.
 */

export function maskSigningSecretForList(secret: string | null | undefined): string | null {
  if (secret == null) return null;
  const s = String(secret);
  if (s.trim() === '') return null;
  if (s.length <= 4) return '****';
  return `****${s.slice(-4)}`;
}
