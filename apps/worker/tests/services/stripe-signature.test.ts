import { describe, expect, it } from 'vitest';
import { verifyStripeSignature } from '../../src/services/stripe-signature.js';

async function stripeStyleSig(secret: string, rawBody: string, timestamp: string): Promise<string> {
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
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('verifyStripeSignature', () => {
  it('accepts a well-formed Stripe-Signature header', async () => {
    const secret = 'whsec_test';
    const body = '{"id":"evt_1"}';
    const t = '1234567890';
    const v1 = await stripeStyleSig(secret, body, t);
    const header = `t=${t},v1=${v1}`;
    await expect(verifyStripeSignature(secret, body, header)).resolves.toBe(true);
  });

  it('rejects wrong secret', async () => {
    const body = '{"id":"evt_1"}';
    const t = '1234567890';
    const v1 = await stripeStyleSig('whsec_a', body, t);
    await expect(verifyStripeSignature('whsec_b', body, `t=${t},v1=${v1}`)).resolves.toBe(false);
  });

  it('rejects missing v1 or t', async () => {
    await expect(verifyStripeSignature('s', '{}', 't=1')).resolves.toBe(false);
    await expect(verifyStripeSignature('s', '{}', 'v1=abc')).resolves.toBe(false);
    await expect(verifyStripeSignature('s', '{}', '')).resolves.toBe(false);
  });
});
