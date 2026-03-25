import { bench, describe } from 'vitest';
import { expandVariables } from '../../src/services/step-delivery.js';
import { buildSegmentQuery } from '../../src/services/segment-query.js';

describe('core helpers', () => {
  bench('expandVariables', () => {
    expandVariables(
      'Hello {{name}} {{uid}} {{friend_id}} {{ref}} {{#if_ref}}ref={{ref}}{{/if_ref}}',
      {
        id: 'friend-1',
        display_name: 'Alice',
        user_id: 'user-1',
        ref_code: 'campaign-1',
      },
      'https://worker.example.com',
    );
  });

  bench('buildSegmentQuery', () => {
    buildSegmentQuery({
      operator: 'AND',
      rules: [
        { type: 'tag_exists', value: 'tag-1' },
        { type: 'metadata_equals', value: { key: 'plan', value: 'pro' } },
        { type: 'is_following', value: true },
      ],
    });
  });
});
