import { describe, expect, it } from 'vitest';
import { verifiedLineLoginChannelId, verifiedLineLoginSub } from '@line-crm/shared';

describe('verifiedLineLoginSub / verifiedLineLoginChannelId', () => {
  it('brands non-empty strings', () => {
    expect(String(verifiedLineLoginSub('Uabc'))).toBe('Uabc');
    expect(String(verifiedLineLoginChannelId('chan-1'))).toBe('chan-1');
  });

  it('rejects empty sub', () => {
    expect(() => verifiedLineLoginSub('')).toThrow(TypeError);
  });

  it('rejects empty channel id', () => {
    expect(() => verifiedLineLoginChannelId('')).toThrow(TypeError);
  });
});
