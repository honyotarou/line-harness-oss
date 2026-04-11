import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

describe('verifySignedPayload', () => {
  it('accepts valid hex hmac signatures', async () => {
    const { verifySignedPayload } = await import('../../src/services/signed-payload.js');

    await expect(
      verifySignedPayload('top-secret', '{"ok":true}', sign('top-secret', '{"ok":true}')),
    ).resolves.toBe(true);
  });

  it('rejects missing or invalid signatures', async () => {
    const { verifySignedPayload } = await import('../../src/services/signed-payload.js');

    await expect(verifySignedPayload('top-secret', '{"ok":true}', '')).resolves.toBe(false);
    await expect(
      verifySignedPayload('top-secret', '{"ok":true}', sign('wrong-secret', '{"ok":true}')),
    ).resolves.toBe(false);
  });

  it('accepts uppercase hex signatures (timing-safe compare normalizes A–F)', async () => {
    const { verifySignedPayload } = await import('../../src/services/signed-payload.js');
    const mac = sign('top-secret', '{"ok":true}');
    await expect(verifySignedPayload('top-secret', '{"ok":true}', mac.toUpperCase())).resolves.toBe(
      true,
    );
  });
});
