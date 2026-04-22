import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildTimestampedSignedPayload } from '../../src/services/signed-payload.js';

function hmacHex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

describe('verifyIncomingWebhookSignedBody', () => {
  it('rejects legacy body-only HMAC (missing timestamp header)', async () => {
    const { verifyIncomingWebhookSignedBody } = await import(
      '../../src/services/incoming-webhook-receive-signature.js'
    );
    const body = '{"ok":true}';
    const legacy = hmacHex('secret', body);
    await expect(verifyIncomingWebhookSignedBody('secret', body, legacy, undefined)).resolves.toBe(
      false,
    );
  });

  it('rejects empty or whitespace timestamp header', async () => {
    const { verifyIncomingWebhookSignedBody } = await import(
      '../../src/services/incoming-webhook-receive-signature.js'
    );
    const body = '{"ok":true}';
    const legacy = hmacHex('secret', body);
    await expect(verifyIncomingWebhookSignedBody('secret', body, legacy, '   ')).resolves.toBe(
      false,
    );
  });

  it('accepts timestamped HMAC within max age', async () => {
    const { verifyIncomingWebhookSignedBody } = await import(
      '../../src/services/incoming-webhook-receive-signature.js'
    );
    const body = '{"x":1}';
    const ts = '1700000000';
    const mac = hmacHex('s', buildTimestampedSignedPayload(ts, body));
    await expect(
      verifyIncomingWebhookSignedBody('s', body, mac, ts, { nowMs: 1700000000_000 }),
    ).resolves.toBe(true);
  });

  it('rejects timestamp outside replay window', async () => {
    const { verifyIncomingWebhookSignedBody } = await import(
      '../../src/services/incoming-webhook-receive-signature.js'
    );
    const body = '{"x":1}';
    const ts = '1700000000';
    const mac = hmacHex('s', buildTimestampedSignedPayload(ts, body));
    await expect(
      verifyIncomingWebhookSignedBody('s', body, mac, ts, { nowMs: 1700000500_000 }),
    ).resolves.toBe(false);
  });
});
