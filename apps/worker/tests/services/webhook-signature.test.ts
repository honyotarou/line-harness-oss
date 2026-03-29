import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

function validSignature(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}

describe('verifySignature (line-sdk)', () => {
  it('accepts a valid HMAC-SHA256 base64 signature', async () => {
    const { verifySignature } = await import('@line-crm/line-sdk');
    const secret = 'channel-secret';
    const body = '{"events":[]}';
    const signature = validSignature(secret, body);

    await expect(verifySignature(secret, body, signature)).resolves.toBe(true);
  });

  it('rejects an invalid signature', async () => {
    const { verifySignature } = await import('@line-crm/line-sdk');
    const secret = 'channel-secret';
    const body = '{"events":[]}';
    const wrongSig = validSignature('wrong-secret', body);

    await expect(verifySignature(secret, body, wrongSig)).resolves.toBe(false);
  });

  it('rejects a tampered body', async () => {
    const { verifySignature } = await import('@line-crm/line-sdk');
    const secret = 'channel-secret';
    const body = '{"events":[]}';
    const signature = validSignature(secret, body);

    await expect(verifySignature(secret, body + 'x', signature)).resolves.toBe(false);
  });

  it('rejects signatures with wrong length (constant-time safe)', async () => {
    const { verifySignature } = await import('@line-crm/line-sdk');
    const secret = 'channel-secret';
    const body = '{"events":[]}';

    // Short signature
    await expect(verifySignature(secret, body, 'short')).resolves.toBe(false);
    // Empty signature
    await expect(verifySignature(secret, body, '')).resolves.toBe(false);
  });
});
