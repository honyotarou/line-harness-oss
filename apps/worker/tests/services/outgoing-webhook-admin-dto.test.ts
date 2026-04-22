import { describe, expect, it } from 'vitest';
import {
  mapOutgoingWebhookAdminCreated,
  mapOutgoingWebhookAdminListItem,
  mapOutgoingWebhookAdminUpdated,
} from '../../src/services/outgoing-webhook-admin-dto.js';

const row = {
  id: 'w1',
  name: 'n',
  url: 'https://example.com/hook',
  event_types: '["a","b"]',
  secret: 'raw-secret',
  line_account_id: 'acc-1',
  is_active: 1,
  created_at: '2026-01-01T00:00:00+09:00',
  updated_at: '2026-01-02T00:00:00+09:00',
} as const;

describe('outgoing-webhook-admin-dto', () => {
  it('list item masks secret and exposes timestamps', () => {
    const j = mapOutgoingWebhookAdminListItem(row);
    expect(j.secret).not.toBe(row.secret);
    expect(j.eventTypes).toEqual(['a', 'b']);
    expect(j).toMatchObject({
      id: 'w1',
      lineAccountId: 'acc-1',
      isActive: true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  it('created payload omits secret and includes createdAt', () => {
    const j = mapOutgoingWebhookAdminCreated(row);
    expect(j).not.toHaveProperty('secret');
    expect(j).toMatchObject({ createdAt: row.created_at });
  });

  it('updated payload omits secret and timestamps', () => {
    const j = mapOutgoingWebhookAdminUpdated(row);
    expect(j).not.toHaveProperty('secret');
    expect(j).not.toHaveProperty('createdAt');
    expect(j).not.toHaveProperty('updatedAt');
  });
});
