import { describe, expect, it } from 'vitest';
import {
  parseLineAccountSecretsKey,
  sealLineAccountSecretField,
  unsealLineAccountSecretField,
} from '@line-crm/shared/line-account-at-rest';

describe('line account at-rest crypto', () => {
  it('round-trips a secret with a valid 32-byte key', async () => {
    const key = new Uint8Array(32);
    key.fill(7);
    const plain = 'channel-access-token-abc';
    const sealed = await sealLineAccountSecretField(plain, key);
    expect(sealed.startsWith('lh1:')).toBe(true);
    const out = await unsealLineAccountSecretField(sealed, key);
    expect(out).toBe(plain);
  });

  it('passes through plaintext when value is not sealed', async () => {
    const key = new Uint8Array(32);
    key.fill(1);
    expect(await unsealLineAccountSecretField('plain-token', key)).toBe('plain-token');
  });

  it('parses standard base64 32-byte keys', () => {
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const b64 = Buffer.from(raw).toString('base64');
    const parsed = parseLineAccountSecretsKey(b64);
    expect(parsed).toBeDefined();
    expect(parsed!.length).toBe(32);
  });
});
