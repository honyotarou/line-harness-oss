import { createNotification, jstNow } from '@line-crm/db';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 5 * 60_000;
const MAX_RETRY_DELAY_MS = 60 * 60_000;

type DeliveryOperationStatus = 'pending' | 'sent' | 'failed';

interface DeliveryOperationRow {
  id: string;
  idempotency_key: string;
  status: DeliveryOperationStatus;
  attempt_count: number;
  next_retry_at: string | null;
  last_error: string | null;
  metadata: string | null;
}

export interface DeliveryAttemptInput {
  idempotencyKey: string;
  jobName: string;
  sourceType: string;
  sourceId: string;
  friendId?: string | null;
  lineAccountId?: string | null;
  metadata?: Record<string, unknown> | string | null;
}

export interface DeliveryFailureInput extends DeliveryAttemptInput {
  error: unknown;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  return 'Unknown delivery error';
}

function normalizeMetadata(
  metadata?: Record<string, unknown> | string | null,
  error?: unknown,
): string | null {
  if (typeof metadata === 'string') {
    return metadata;
  }

  const payload = metadata ? { ...metadata } : {};
  if (error instanceof Error) {
    payload.errorName = error.name;
    payload.errorMessage = error.message;
    if (error.stack) {
      payload.errorStack = error.stack;
    }
  } else if (error !== undefined) {
    payload.errorMessage = normalizeErrorMessage(error);
  }

  return Object.keys(payload).length > 0 ? JSON.stringify(payload) : null;
}

function computeRetryDelayMs(attemptCount: number, baseRetryMs: number): number {
  const exponent = Math.max(attemptCount - 1, 0);
  return Math.min(baseRetryMs * (2 ** exponent), MAX_RETRY_DELAY_MS);
}

async function getDeliveryOperation(
  db: D1Database,
  idempotencyKey: string,
): Promise<DeliveryOperationRow | null> {
  return db
    .prepare(`SELECT * FROM delivery_operations WHERE idempotency_key = ?`)
    .bind(idempotencyKey)
    .first<DeliveryOperationRow>();
}

export async function beginDeliveryAttempt(
  db: D1Database,
  input: DeliveryAttemptInput,
  options?: { now?: number },
): Promise<boolean> {
  const nowMs = options?.now ?? Date.now();
  const now = jstNow();
  const existing = await getDeliveryOperation(db, input.idempotencyKey);

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO delivery_operations
           (id, idempotency_key, job_name, line_account_id, source_type, source_id, friend_id, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.idempotencyKey,
        input.jobName,
        input.lineAccountId ?? null,
        input.sourceType,
        input.sourceId,
        input.friendId ?? null,
        normalizeMetadata(input.metadata),
        now,
        now,
      )
      .run();
    return true;
  }

  if (existing.status === 'sent' || existing.status === 'pending') {
    return false;
  }

  if (!existing.next_retry_at) {
    return false;
  }

  if (new Date(existing.next_retry_at).getTime() > nowMs) {
    return false;
  }

  await db
    .prepare(
      `UPDATE delivery_operations SET status = 'pending', next_retry_at = NULL, last_error = NULL, updated_at = ? WHERE idempotency_key = ?`,
    )
    .bind(now, input.idempotencyKey)
    .run();

  return true;
}

export async function markDeliveryAttemptSucceeded(
  db: D1Database,
  input: Pick<DeliveryAttemptInput, 'idempotencyKey'>,
): Promise<void> {
  await db
    .prepare(
      `UPDATE delivery_operations SET status = 'sent', next_retry_at = NULL, last_error = NULL, updated_at = ? WHERE idempotency_key = ?`,
    )
    .bind(jstNow(), input.idempotencyKey)
    .run();
}

export async function markDeliveryAttemptFailed(
  db: D1Database,
  input: DeliveryFailureInput,
  options?: {
    maxAttempts?: number;
    now?: number;
    baseRetryMs?: number;
  },
): Promise<void> {
  const existing = await getDeliveryOperation(db, input.idempotencyKey);
  const attemptCount = (existing?.attempt_count ?? 0) + 1;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const nowMs = options?.now ?? Date.now();
  const now = jstNow();
  const lastError = normalizeErrorMessage(input.error);
  const metadata = normalizeMetadata(input.metadata, input.error);
  const exhausted = attemptCount >= maxAttempts;
  const nextRetryAt = exhausted
    ? null
    : new Date(nowMs + computeRetryDelayMs(attemptCount, options?.baseRetryMs ?? DEFAULT_RETRY_BASE_MS)).toISOString();

  await db
    .prepare(
      `UPDATE delivery_operations SET status = 'failed', attempt_count = ?, next_retry_at = ?, last_error = ?, metadata = ?, updated_at = ? WHERE idempotency_key = ?`,
    )
    .bind(attemptCount, nextRetryAt, lastError, metadata, now, input.idempotencyKey)
    .run();

  if (!exhausted) {
    return;
  }

  await db
    .prepare(
      `INSERT INTO delivery_dead_letters
         (id, operation_id, idempotency_key, job_name, line_account_id, source_type, source_id, friend_id, error_message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      existing?.id ?? null,
      input.idempotencyKey,
      input.jobName,
      input.lineAccountId ?? null,
      input.sourceType,
      input.sourceId,
      input.friendId ?? null,
      lastError,
      metadata,
      now,
    )
    .run();

  await createNotification(db, {
    eventType: 'delivery_failure',
    title: `Delivery failed: ${input.jobName}`,
    body: lastError,
    channel: 'dashboard',
    lineAccountId: input.lineAccountId ?? null,
    metadata: normalizeMetadata(
      {
        idempotencyKey: input.idempotencyKey,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        friendId: input.friendId ?? null,
        attempts: attemptCount,
      },
      input.error,
    ) ?? undefined,
  });
}
