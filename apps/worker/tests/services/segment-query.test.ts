import { describe, expect, it } from 'vitest';
import { buildSegmentQuery } from '../../src/services/segment-query.js';

describe('buildSegmentQuery', () => {
  it('builds SQL and bindings for every supported rule type', () => {
    const result = buildSegmentQuery({
      operator: 'AND',
      rules: [
        { type: 'tag_exists', value: 'tag-1' },
        { type: 'tag_not_exists', value: 'tag-2' },
        { type: 'metadata_equals', value: { key: 'plan', value: 'pro' } },
        { type: 'metadata_not_equals', value: { key: 'status', value: 'blocked' } },
        { type: 'ref_code', value: 'campaign-1' },
        { type: 'is_following', value: true },
      ],
    });

    expect(result.sql).toContain('EXISTS (SELECT 1 FROM friend_tags');
    expect(result.sql).toContain('NOT EXISTS (SELECT 1 FROM friend_tags');
    expect(result.sql).toContain('json_extract(f.metadata, ?) = ?');
    expect(result.sql).toContain('json_extract(f.metadata, ?) IS NULL');
    expect(result.sql).toContain('f.ref_code = ?');
    expect(result.sql).toContain('f.is_following = ?');
    expect(result.bindings).toEqual([
      'tag-1',
      'tag-2',
      '$.plan',
      'pro',
      '$.status',
      '$.status',
      'blocked',
      'campaign-1',
      1,
    ]);
  });

  it('falls back to a no-op predicate when no rules are provided', () => {
    const result = buildSegmentQuery({ operator: 'OR', rules: [] });
    expect(result.sql).toContain('WHERE 1=1');
    expect(result.bindings).toEqual([]);
  });

  it('rejects invalid rule payloads', () => {
    expect(() =>
      buildSegmentQuery({
        operator: 'AND',
        rules: [{ type: 'tag_exists', value: true }],
      }),
    ).toThrow('tag_exists rule requires a string tag ID value');

    expect(() =>
      buildSegmentQuery({
        operator: 'AND',
        rules: [{ type: 'metadata_equals', value: 'bad' as never }],
      }),
    ).toThrow('metadata_equals rule requires { key: string; value: string }');

    expect(() =>
      buildSegmentQuery({
        operator: 'AND',
        rules: [{ type: 'is_following', value: 'yes' as never }],
      }),
    ).toThrow('is_following rule requires a boolean value');
  });
});
