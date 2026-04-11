/**
 * Constant-time comparison for UTF-8 strings of equal byte length (e.g. API keys).
 * Different lengths return false immediately (may leak length — use fixed-length secrets in production).
 */

export function timingSafeEqualUtf8(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.length !== bb.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) {
    diff |= aa[i]! ^ bb[i]!;
  }
  return diff === 0;
}
