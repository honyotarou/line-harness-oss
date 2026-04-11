async function computeHexHmac(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time comparison for hex HMAC strings (mitigate timing leaks). */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    const ca = a.charCodeAt(i);
    const cb = b.charCodeAt(i);
    const na = ca >= 65 && ca <= 70 ? ca + 32 : ca;
    const nb = cb >= 65 && cb <= 70 ? cb + 32 : cb;
    diff |= na ^ nb;
  }
  return diff === 0;
}

export async function verifySignedPayload(
  secret: string,
  payload: string,
  providedSignature: string,
): Promise<boolean> {
  if (!providedSignature) {
    return false;
  }

  const expectedSignature = await computeHexHmac(secret, payload);
  return constantTimeEqualHex(providedSignature, expectedSignature);
}
