import { describe, expect, it, vi } from 'vitest';
import { tryConsumeIncomingWebhookPayload } from '../../src/services/incoming-webhook-dedup.js';

describe('tryConsumeIncomingWebhookPayload', () => {
  it('returns true on first insert and false on identical raw body', async () => {
    const seen = new Set<string>();
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('incoming_webhook_processed_payloads') && sql.includes('INSERT')) {
          return {
            bind: vi.fn((webhookId: string, payloadHash: string, _ms: number) => ({
              run: vi.fn(async () => {
                const k = `${webhookId}:${payloadHash}`;
                if (seen.has(k)) return { meta: { changes: 0 } };
                seen.add(k);
                return { meta: { changes: 1 } };
              }),
            })),
          };
        }
        if (sql.includes('DELETE') && sql.includes('incoming_webhook_processed_payloads')) {
          return { bind: vi.fn(() => ({ run: vi.fn().mockResolvedValue({}) })) };
        }
        throw new Error(`unexpected sql: ${sql}`);
      }),
    } as unknown as D1Database;

    const raw = '{"a":1}';
    await expect(tryConsumeIncomingWebhookPayload(db, 'w1', raw)).resolves.toBe(true);
    await expect(tryConsumeIncomingWebhookPayload(db, 'w1', raw)).resolves.toBe(false);
    await expect(tryConsumeIncomingWebhookPayload(db, 'w2', raw)).resolves.toBe(true);
  });
});
