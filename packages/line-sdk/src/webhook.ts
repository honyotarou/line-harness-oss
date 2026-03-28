/**
 * Verifies the X-Line-Signature header using HMAC-SHA256.
 * Must be called before processing any webhook event.
 *
 * @param channelSecret - LINE channel secret
 * @param body          - Raw request body string (before JSON.parse)
 * @param signature     - Value of the X-Line-Signature header (base64)
 * @returns true if the signature is valid, false otherwise
 */
export async function verifySignature(
  channelSecret: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(body),
  );

  // Convert the provided base64 signature to bytes for constant-time comparison
  let providedBytes: Uint8Array;
  try {
    const providedBinary = atob(signature);
    providedBytes = Uint8Array.from(providedBinary, (ch) => ch.charCodeAt(0));
  } catch {
    return false; // invalid base64
  }

  const computedBytes = new Uint8Array(signatureBytes);

  // Length mismatch → reject (no timing leak since lengths are public)
  if (computedBytes.length !== providedBytes.length) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  let diff = 0;
  for (let i = 0; i < computedBytes.length; i++) {
    diff |= computedBytes[i] ^ providedBytes[i];
  }
  return diff === 0;
}
