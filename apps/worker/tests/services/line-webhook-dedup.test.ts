import { describe, expect, it, vi } from 'vitest';
import {
  deriveLineWebhookDedupStorageKey,
  tryConsumeLineWebhookEvent,
} from '../../src/services/line-webhook-dedup.js';

function createDbForDedup(opts: { firstInsertChanges: number; secondInsertChanges: number }) {
  let call = 0;
  return {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('DELETE FROM line_webhook_processed_events')) {
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
          })),
        };
      }
      if (sql.includes('line_webhook_processed_events')) {
        return {
          bind: vi.fn(() => ({
            run: vi.fn(async () => {
              call += 1;
              const changes = call === 1 ? opts.firstInsertChanges : opts.secondInsertChanges;
              return { meta: { changes } };
            }),
          })),
        };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    }),
  } as unknown as D1Database;
}

describe('deriveLineWebhookDedupStorageKey', () => {
  it('prefers webhookEventId when present', () => {
    expect(deriveLineWebhookDedupStorageKey({ webhookEventId: ' wid ' })).toBe('wid');
  });

  it('falls back to message userId + message id', () => {
    expect(
      deriveLineWebhookDedupStorageKey({
        type: 'message',
        source: { userId: 'U1' },
        message: { id: 'm1' },
      }),
    ).toBe('line:msg:U1:m1');
  });

  it('falls back to replyToken', () => {
    expect(deriveLineWebhookDedupStorageKey({ replyToken: 'rtok' })).toBe('line:rt:rtok');
  });

  it('returns null when nothing stable is available', () => {
    expect(deriveLineWebhookDedupStorageKey({})).toBeNull();
  });
});

describe('tryConsumeLineWebhookEvent', () => {
  it('returns true without DB access when no dedup key can be derived', async () => {
    const db = {
      prepare: vi.fn(),
    } as unknown as D1Database;

    await expect(tryConsumeLineWebhookEvent(db, {})).resolves.toBe(true);
    await expect(tryConsumeLineWebhookEvent(db, { webhookEventId: '' })).resolves.toBe(true);
    await expect(tryConsumeLineWebhookEvent(db, { webhookEventId: '   ' })).resolves.toBe(true);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('returns true when INSERT OR IGNORE inserts a new row', async () => {
    const db = createDbForDedup({ firstInsertChanges: 1, secondInsertChanges: 0 });
    await expect(
      tryConsumeLineWebhookEvent(db, { webhookEventId: '01JEZQXVC0TESTWEBHOOKID' }),
    ).resolves.toBe(true);
  });

  it('returns false when INSERT OR IGNORE is a duplicate', async () => {
    const db = createDbForDedup({ firstInsertChanges: 0, secondInsertChanges: 0 });
    await expect(
      tryConsumeLineWebhookEvent(db, { webhookEventId: '01JEZQXVC0TESTWEBHOOKID' }),
    ).resolves.toBe(false);
  });

  it('deduplicates by derived replyToken key when webhookEventId is absent', async () => {
    const evt = { replyToken: 'same-rt' };
    const db = createDbForDedup({ firstInsertChanges: 1, secondInsertChanges: 0 });
    await expect(tryConsumeLineWebhookEvent(db, evt)).resolves.toBe(true);
    await expect(tryConsumeLineWebhookEvent(db, evt)).resolves.toBe(false);
  });
});
