import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  jstNow: vi.fn(() => '2026-03-25T10:00:00+09:00'),
}));

vi.mock('@line-crm/db', () => dbMocks);

function createDeliveryDb() {
  const operations = new Map<
    string,
    {
      id: string;
      idempotency_key: string;
      status: 'pending' | 'sent' | 'failed';
      attempt_count: number;
      next_retry_at: string | null;
      last_error: string | null;
      metadata: string | null;
    }
  >();
  const deadLetters = new Map<
    string,
    {
      idempotency_key: string;
      error_message: string;
      metadata: string | null;
    }
  >();

  const db = {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('SELECT * FROM delivery_operations')) {
                const [idempotencyKey] = bindings as [string];
                return (operations.get(idempotencyKey) ?? null) as T | null;
              }
              throw new Error(`Unexpected first SQL: ${sql}`);
            },
            async run() {
              if (sql.includes('INSERT INTO delivery_operations')) {
                const [
                  id,
                  idempotencyKey,
                  _jobName,
                  _lineAccountId,
                  _sourceType,
                  _sourceId,
                  _friendId,
                  metadata,
                  _createdAt,
                  _updatedAt,
                ] = bindings as [
                  string,
                  string,
                  string,
                  string | null,
                  string,
                  string,
                  string | null,
                  string | null,
                  string,
                  string,
                ];
                operations.set(idempotencyKey, {
                  id,
                  idempotency_key: idempotencyKey,
                  status: 'pending',
                  attempt_count: 0,
                  next_retry_at: null,
                  last_error: null,
                  metadata,
                });
                return { success: true };
              }

              if (sql.includes(`UPDATE delivery_operations SET status = 'pending'`)) {
                const [updatedAt, idempotencyKey] = bindings as [string, string];
                const row = operations.get(idempotencyKey);
                if (row) {
                  row.status = 'pending';
                  row.last_error = null;
                  row.next_retry_at = null;
                  void updatedAt;
                }
                return { success: true };
              }

              if (sql.includes(`UPDATE delivery_operations SET status = 'sent'`)) {
                const [updatedAt, idempotencyKey] = bindings as [string, string];
                const row = operations.get(idempotencyKey);
                if (row) {
                  row.status = 'sent';
                  row.last_error = null;
                  row.next_retry_at = null;
                  void updatedAt;
                }
                return { success: true };
              }

              if (sql.includes(`UPDATE delivery_operations SET status = 'failed'`)) {
                const [attemptCount, nextRetryAt, lastError, metadata, updatedAt, idempotencyKey] =
                  bindings as [number, string | null, string, string | null, string, string];
                const row = operations.get(idempotencyKey);
                if (row) {
                  row.status = 'failed';
                  row.attempt_count = attemptCount;
                  row.next_retry_at = nextRetryAt;
                  row.last_error = lastError;
                  row.metadata = metadata;
                  void updatedAt;
                }
                return { success: true };
              }

              if (sql.includes('INSERT INTO delivery_dead_letters')) {
                const [
                  _id,
                  operationId,
                  idempotencyKey,
                  _jobName,
                  _lineAccountId,
                  _sourceType,
                  _sourceId,
                  _friendId,
                  errorMessage,
                  metadata,
                  _createdAt,
                ] = bindings as [
                  string,
                  string | null,
                  string,
                  string,
                  string | null,
                  string,
                  string,
                  string | null,
                  string,
                  string | null,
                  string,
                ];
                deadLetters.set(idempotencyKey, {
                  idempotency_key: idempotencyKey,
                  error_message: errorMessage,
                  metadata,
                });
                void operationId;
                return { success: true };
              }

              throw new Error(`Unexpected run SQL: ${sql}`);
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, operations, deadLetters };
}

describe('delivery reliability helpers', () => {
  beforeEach(() => {
    dbMocks.createNotification.mockClear();
    dbMocks.jstNow.mockReturnValue('2026-03-25T10:00:00+09:00');
  });

  it('reserves new delivery attempts and blocks concurrent duplicates', async () => {
    const { beginDeliveryAttempt } = await import('../../src/services/delivery-reliability.js');
    const { db, operations } = createDeliveryDb();

    await expect(
      beginDeliveryAttempt(db, {
        idempotencyKey: 'step:1',
        jobName: 'step_deliveries',
        sourceType: 'friend_scenario',
        sourceId: 'friend-scenario-1',
        friendId: 'friend-1',
        lineAccountId: 'account-1',
      }),
    ).resolves.toBe(true);

    await expect(
      beginDeliveryAttempt(db, {
        idempotencyKey: 'step:1',
        jobName: 'step_deliveries',
        sourceType: 'friend_scenario',
        sourceId: 'friend-scenario-1',
        friendId: 'friend-1',
        lineAccountId: 'account-1',
      }),
    ).resolves.toBe(false);

    expect(operations.get('step:1')?.status).toBe('pending');
  });

  it('moves exhausted failures to the dead-letter queue and creates a dashboard notification', async () => {
    const { beginDeliveryAttempt, markDeliveryAttemptFailed } = await import(
      '../../src/services/delivery-reliability.js'
    );
    const { db, operations, deadLetters } = createDeliveryDb();

    await beginDeliveryAttempt(db, {
      idempotencyKey: 'step:2',
      jobName: 'step_deliveries',
      sourceType: 'friend_scenario',
      sourceId: 'friend-scenario-2',
      friendId: 'friend-2',
      lineAccountId: 'account-2',
    });

    await markDeliveryAttemptFailed(
      db,
      {
        idempotencyKey: 'step:2',
        jobName: 'step_deliveries',
        sourceType: 'friend_scenario',
        sourceId: 'friend-scenario-2',
        friendId: 'friend-2',
        lineAccountId: 'account-2',
        error: new Error('push failed'),
      },
      { maxAttempts: 1 },
    );

    expect(operations.get('step:2')).toMatchObject({
      status: 'failed',
      attempt_count: 1,
      next_retry_at: null,
    });
    expect(deadLetters.get('step:2')).toMatchObject({
      error_message: 'push failed',
    });
    expect(dbMocks.createNotification).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        eventType: 'delivery_failure',
        channel: 'dashboard',
        lineAccountId: 'account-2',
      }),
    );
  });
});
