import { describe, expect, it } from 'vitest';
import { pickFormFieldValuesForMetadataMerge } from '../../src/services/form-metadata-filter.js';

describe('pickFormFieldValuesForMetadataMerge', () => {
  it('keeps only keys that match form field names', () => {
    const fields = [
      { name: 'q', label: 'Q', type: 'text' },
      { name: 'email', label: 'Email', type: 'text' },
    ];
    const data = {
      q: 'answer',
      email: 'a@b.com',
      __internal_score: '999',
      admin_notes: 'pwned',
    };
    expect(pickFormFieldValuesForMetadataMerge(data, fields)).toEqual({
      q: 'answer',
      email: 'a@b.com',
    });
  });

  it('returns empty object when no field keys overlap', () => {
    expect(
      pickFormFieldValuesForMetadataMerge({ evil: 1 }, [{ name: 'q', label: 'Q', type: 'text' }]),
    ).toEqual({});
  });
});
