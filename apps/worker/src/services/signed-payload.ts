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

export async function verifySignedPayload(
  secret: string,
  payload: string,
  providedSignature: string,
): Promise<boolean> {
  if (!providedSignature) {
    return false;
  }

  const expectedSignature = await computeHexHmac(secret, payload);
  return expectedSignature === providedSignature;
}
