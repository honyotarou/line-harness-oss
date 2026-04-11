/**
 * Verify Stripe webhook `Stripe-Signature` header (t=..., v1=...).
 * Rejects timestamps outside `toleranceSeconds` (replay protection; Stripe recommends ~5 minutes).
 */
const DEFAULT_STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

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

export async function verifyStripeSignature(
  secret: string,
  rawBody: string,
  sigHeader: string,
  options?: { toleranceSeconds?: number; nowSeconds?: number },
): Promise<boolean> {
  const parts = Object.fromEntries(
    sigHeader.split(',').map((p) => {
      const [k, ...v] = p.split('=');
      return [k, v.join('=')];
    }),
  );
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;

  const tSec = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(tSec)) return false;
  const nowSec = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = options?.toleranceSeconds ?? DEFAULT_STRIPE_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(nowSec - tSec) > tolerance) {
    return false;
  }

  const encoder = new TextEncoder();
  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const computedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return constantTimeEqualHex(computedSig, expectedSig);
}
