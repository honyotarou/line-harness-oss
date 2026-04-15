/**
 * Constant-time comparison for UTF-8 strings without leaking length: SHA-256 each operand,
 * then compare 32-byte digests in constant time (Node Vitest has no `subtle.timingSafeEqual`).
 */
export async function timingSafeEqualUtf8(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const da = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(a)));
  const db = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(b)));
  if (da.length !== db.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < da.length; i += 1) {
    diff |= da[i]! ^ db[i]!;
  }
  return diff === 0;
}
