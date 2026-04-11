import { describe, expect, it } from 'vitest';

describe('calendar-tokens', () => {
  it('round-trips secrets when CALENDAR_TOKEN_ENCRYPTION_SECRET is set', async () => {
    const {
      encryptCalendarTokenAtRest,
      decryptCalendarTokenAtRest,
      decryptGoogleCalendarConnectionRow,
    } = await import('../../src/services/calendar-tokens.js');

    const secret = 'unit-test-calendar-secret';
    const plain = 'ya29.test-access-token';

    const enc = await encryptCalendarTokenAtRest(plain, secret);
    expect(enc).toMatch(/^enc1\./);
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

  it('stores plaintext when secret is unset', async () => {
    const { encryptCalendarTokenAtRest, decryptCalendarTokenAtRest } = await import(
      '../../src/services/calendar-tokens.js'
    );
    const plain = 'plain-token';
    await expect(encryptCalendarTokenAtRest(plain, undefined)).resolves.toBe(plain);
    await expect(decryptCalendarTokenAtRest(plain, undefined)).resolves.toBe(plain);
  });
});
