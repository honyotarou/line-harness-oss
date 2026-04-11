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
    await expect(
      verifyStripeSignature(secret, body, header, {
        nowSeconds: 1234567890,
        toleranceSeconds: 300,
      }),
    ).resolves.toBe(true);
  });

  it('rejects wrong secret', async () => {
    const body = '{"id":"evt_1"}';
    const t = '1234567890';
    const v1 = await stripeStyleSig('whsec_a', body, t);
    await expect(
      verifyStripeSignature('whsec_b', body, `t=${t},v1=${v1}`, {
        nowSeconds: 1234567890,
        toleranceSeconds: 300,
      }),
    ).resolves.toBe(false);
  });

  it('rejects missing v1 or t', async () => {
    await expect(verifyStripeSignature('s', '{}', 't=1')).resolves.toBe(false);
    await expect(verifyStripeSignature('s', '{}', 'v1=abc')).resolves.toBe(false);
    await expect(verifyStripeSignature('s', '{}', '')).resolves.toBe(false);
  });

  /**
   * Cycle 2 — Attacker view: replay old Stripe webhook bodies with still-valid HMAC outside Stripe tolerance.
   */
  it('rejects signatures when timestamp is outside tolerance (replay protection)', async () => {
    const secret = 'whsec_test';
    const body = '{"id":"evt_replay"}';
    const oldT = '1000000000';
    const v1 = await stripeStyleSig(secret, body, oldT);
    const header = `t=${oldT},v1=${v1}`;
    const nowSec = 1_700_000_000;
    await expect(
      verifyStripeSignature(secret, body, header, { nowSeconds: nowSec, toleranceSeconds: 300 }),
    ).resolves.toBe(false);
  });

  it('accepts signatures within tolerance window', async () => {
    const secret = 'whsec_test';
    const body = '{"id":"evt_fresh"}';
    const nowSec = 1_700_000_000;
    const t = String(nowSec - 60);
    const v1 = await stripeStyleSig(secret, body, t);
    await expect(
      verifyStripeSignature(secret, body, `t=${t},v1=${v1}`, {
        nowSeconds: nowSec,
        toleranceSeconds: 300,
      }),
    ).resolves.toBe(true);
  });

  it('accepts uppercase hex in v1 (constant-time compare normalizes A–F)', async () => {
    const secret = 'whsec_test';
    const body = '{}';
    const t = '1700000000';
    const v1 = (await stripeStyleSig(secret, body, t)).toUpperCase();
    await expect(
      verifyStripeSignature(secret, body, `t=${t},v1=${v1}`, {
        nowSeconds: 1_700_000_000,
        toleranceSeconds: 300,
      }),
    ).resolves.toBe(true);
  });
});
