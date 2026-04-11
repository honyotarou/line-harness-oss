import { describe, expect, it } from 'vitest';

describe('safe-json', () => {
  it('tryParseJsonArray returns [] for invalid or non-array JSON', async () => {
    const { tryParseJsonArray } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonArray('')).toEqual([]);
    expect(tryParseJsonArray('{bad')).toEqual([]);
    expect(tryParseJsonArray('{"x":1}')).toEqual([]);
    expect(tryParseJsonArray('[1,2]')).toEqual([1, 2]);
  });

  it('tryParseJsonLoose returns null for invalid JSON', async () => {
    const { tryParseJsonLoose } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonLoose('')).toBeNull();
    expect(tryParseJsonLoose('{x')).toBeNull();
    expect(tryParseJsonLoose('42')).toBe(42);
    expect(tryParseJsonLoose('null')).toBeNull();
  });
});
