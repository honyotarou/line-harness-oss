import { describe, expect, it } from 'vitest';

describe('calendar-tokens', () => {
  it('round-trips secrets with HKDF-derived enc2 when CALENDAR_TOKEN_ENCRYPTION_SECRET is set', async () => {
    const {
      encryptCalendarTokenAtRest,
      decryptCalendarTokenAtRest,
      decryptGoogleCalendarConnectionRow,
    } = await import('../../src/services/calendar-tokens.js');

    const secret = 'unit-test-calendar-secret';
    const plain = 'ya29.test-access-token';

    const enc = await encryptCalendarTokenAtRest(plain, secret);
    expect(enc).toMatch(/^enc2\./);
    await expect(decryptCalendarTokenAtRest(enc, secret)).resolves.toBe(plain);

    const row = {
      id: 'c1',
      calendar_id: 'primary',
      access_token: enc,
      refresh_token: null,
      api_key: null,
      auth_type: 'oauth',
      is_active: 1,
      created_at: 'x',
      updated_at: 'x',
    };
    const dec = await decryptGoogleCalendarConnectionRow(row, secret);
    expect(dec.access_token).toBe(plain);
  });

  it('still decrypts legacy enc1 payloads', async () => {
    const { decryptCalendarTokenAtRest } = await import('../../src/services/calendar-tokens.js');
    const secret = 'unit-test-calendar-secret';
    const plain = 'legacy-token';
    const raw = new TextEncoder().encode(secret);
    const keyRaw = await crypto.subtle.digest('SHA-256', raw);
    const key = await crypto.subtle.importKey(
      'raw',
      keyRaw,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );
    const iv = new Uint8Array(12);
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)),
    );
    const combined = new Uint8Array(iv.length + ct.length);
    combined.set(iv);
    combined.set(ct, iv.length);
    let binary = '';
    for (const b of combined) binary += String.fromCharCode(b);
    const b64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const stored = `enc1.${b64}`;

    await expect(decryptCalendarTokenAtRest(stored, secret)).resolves.toBe(plain);
  });

  it('stores plaintext when secret is unset (legacy)', async () => {
    const { encryptCalendarTokenAtRest, decryptCalendarTokenAtRest } = await import(
      '../../src/services/calendar-tokens.js'
    );
    const plain = 'plain-token';
    await expect(encryptCalendarTokenAtRest(plain, undefined)).resolves.toBe(plain);
    await expect(decryptCalendarTokenAtRest(plain, undefined)).resolves.toBe(plain);
  });

  it('throws when requireSecret is set but secret is missing', async () => {
    const { encryptCalendarTokenAtRest } = await import('../../src/services/calendar-tokens.js');
    await expect(
      encryptCalendarTokenAtRest('tok', undefined, { requireSecret: true }),
    ).rejects.toThrow(/CALENDAR_TOKEN_ENCRYPTION_SECRET/);
  });
});
