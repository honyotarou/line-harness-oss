import { describe, expect, it } from 'vitest';
import { timingSafeEqualUtf8 } from '../../src/services/timing-safe-equal.js';

describe('timingSafeEqualUtf8', () => {
  it('returns true only for exact matches of the same byte length', () => {
    expect(timingSafeEqualUtf8('same-secret-key', 'same-secret-key')).toBe(true);
    expect(timingSafeEqualUtf8('a', 'b')).toBe(false);
    expect(timingSafeEqualUtf8('short', 'longer!')).toBe(false);
  });
});
