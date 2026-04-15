import { describe, expect, it } from 'vitest';
import { timingSafeEqualUtf8 } from '../../src/services/timing-safe-equal.js';

describe('timingSafeEqualUtf8', () => {
  it('returns true only for exact UTF-8 matches (length is not leaked)', async () => {
    await expect(timingSafeEqualUtf8('same-secret-key', 'same-secret-key')).resolves.toBe(true);
    await expect(timingSafeEqualUtf8('a', 'b')).resolves.toBe(false);
    await expect(timingSafeEqualUtf8('short', 'longer!')).resolves.toBe(false);
  });
});
