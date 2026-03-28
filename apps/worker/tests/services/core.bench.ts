import { bench, describe } from 'vitest';
import { expandVariables } from '../../src/services/step-delivery.js';
import { buildSegmentQuery } from '../../src/services/segment-query.js';
import { buildAllowedOrigins, isAllowedOrigin } from '../../src/services/cors-policy.js';

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

  const corsSet = new Set(
    buildAllowedOrigins({
      WEB_URL: 'https://admin.example.com',
      WORKER_URL: 'https://api.example.com',
      ALLOWED_ORIGINS: 'https://a.example.com,https://b.example.com',
    }),
  );

  bench('isAllowedOrigin (Set lookup)', () => {
    isAllowedOrigin('https://admin.example.com', corsSet);
  });
});
