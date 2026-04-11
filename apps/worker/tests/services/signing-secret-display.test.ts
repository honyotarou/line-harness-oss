import { describe, expect, it } from 'vitest';
import { maskSigningSecretForList } from '../../src/services/signing-secret-display.js';

describe('maskSigningSecretForList', () => {
  it('returns null for null, undefined, empty, or whitespace-only', () => {
    expect(maskSigningSecretForList(null)).toBe(null);
    expect(maskSigningSecretForList(undefined)).toBe(null);
    expect(maskSigningSecretForList('')).toBe(null);
    expect(maskSigningSecretForList('  ')).toBe(null);
  });

  it('returns **** for secrets up to 4 characters', () => {
    expect(maskSigningSecretForList('a')).toBe('****');
    expect(maskSigningSecretForList('abcd')).toBe('****');
  });

  it('returns **** plus last four characters for longer secrets', () => {
    expect(maskSigningSecretForList('my-super-hmac-secret-key')).toBe('****-key');
  });
});
