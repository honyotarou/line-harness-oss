import { getBroadcastById, updateBroadcastStatus, jstNow } from '@line-crm/db';
import type { Broadcast } from '@line-crm/db';
import type { LineClient } from '@line-crm/line-sdk';
import {
  beginDeliveryAttempt,
  markDeliveryAttemptFailed,
  markDeliveryAttemptSucceeded,
} from './delivery-reliability.js';
import { buildMessageFromStoredContent } from './stored-line-message.js';
import {
  calculateStaggerDelay,
  sleep,
  addMessageVariation,
  StealthRateLimiter,
} from './stealth.js';
import { buildSegmentQuery } from './segment-query.js';
import type { SegmentCondition } from './segment-query.js';

/** Canonical JSON for hashing so rule order does not spawn duplicate sends for the same segment. */
function canonicalSegmentConditionJson(condition: SegmentCondition): string {
  const rules = [...condition.rules].sort((a, b) => {
    const sa = `${a.type}\0${JSON.stringify(a.value)}`;
    const sb = `${b.type}\0${JSON.stringify(b.value)}`;
    return sa.localeCompare(sb);
  });
  return JSON.stringify({ operator: condition.operator, rules });
}

async function segmentConditionIdempotencyTag(condition: SegmentCondition): Promise<string> {
  const payload = canonicalSegmentConditionJson(condition);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

const MULTICAST_BATCH_SIZE = 500;

interface FriendRow {
  id: string;
  line_user_id: string;
}

export async function processSegmentSend(
  db: D1Database,
  lineClient: LineClient,
  broadcastId: string,
  condition: SegmentCondition,
  options?: { skipMarkSending?: boolean },
): Promise<Broadcast> {
  const broadcast = await getBroadcastById(db, broadcastId);
  if (!broadcast) {
    throw new Error(`Broadcast ${broadcastId} not found`);
  }

  const segmentTag = await segmentConditionIdempotencyTag(condition);
  const idempotencyKey = `broadcast-segment:${broadcast.id}:${segmentTag}`;
  const attempt = {
    idempotencyKey,
    jobName: 'broadcast_send_segment',
    sourceType: 'broadcast',
    sourceId: broadcast.id,
    lineAccountId: broadcast.line_account_id ?? null,
    metadata: {
      conditionOperator: condition.operator,
      rulesCount: condition.rules.length,
    },
  };
  const reserved = await beginDeliveryAttempt(db, attempt);
  if (!reserved) {
    return broadcast;
  }

  if (!options?.skipMarkSending) {
    await updateBroadcastStatus(db, broadcastId, 'sending');
  }

  const message = buildMessageFromStoredContent(broadcast.message_type, broadcast.message_content, {
    flexAltFallback: 'Message',
  });

  let totalCount = 0;
  let successCount = 0;

  try {
    // Build and execute segment query to get matching friends
    const { sql, bindings } = buildSegmentQuery(condition);
    const queryResult = await db
      .prepare(sql)
      .bind(...bindings)
      .all<FriendRow>();

    const friends = queryResult.results ?? [];
    totalCount = friends.length;

    const now = jstNow();
    const totalBatches = Math.ceil(friends.length / MULTICAST_BATCH_SIZE);
    const stealthLimiter = new StealthRateLimiter(1000, 60_000, {
      db,
      subjectKey: `line:${broadcast.line_account_id ?? 'default'}`,
    });

    for (let i = 0; i < friends.length; i += MULTICAST_BATCH_SIZE) {
      const batchIndex = Math.floor(i / MULTICAST_BATCH_SIZE);
      const batch = friends.slice(i, i + MULTICAST_BATCH_SIZE);
      const lineUserIds = batch.map((f) => f.line_user_id);

      // Stealth: stagger delays between batches
      if (batchIndex > 0) {
        const delay = calculateStaggerDelay(friends.length, batchIndex);
        await sleep(delay);
      }

      // Stealth: add slight variation to text messages
      let batchMessage = message;
      if (message.type === 'text' && totalBatches > 1) {
        batchMessage = { ...message, text: addMessageVariation(message.text, batchIndex) };
      }

      try {
        await stealthLimiter.waitForSlot();
        const multicastResult = await lineClient.multicast(lineUserIds, [batchMessage]);
        const invalid = new Set(multicastResult?.invalidUserIds ?? []);
        const delivered = batch.filter((f) => !invalid.has(f.line_user_id));
        successCount += delivered.length;

        // Log successfully sent messages
        for (const friend of delivered) {
          const logId = crypto.randomUUID();
          await db
            .prepare(
              `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
               VALUES (?, ?, 'outgoing', ?, ?, ?, NULL, ?)`,
            )
            .bind(
              logId,
              friend.id,
              broadcast.message_type,
              broadcast.message_content,
              broadcastId,
              now,
            )
            .run();
        }
      } catch (err) {
        console.error(`Segment multicast batch ${batchIndex} failed:`, err);
        // Continue with next batch; failed batch is not logged
      }
    }

    await markDeliveryAttemptSucceeded(db, { idempotencyKey });
    await updateBroadcastStatus(db, broadcastId, 'sent', { totalCount, successCount });
  } catch (err) {
    // On failure, reset to draft so it can be retried
    await markDeliveryAttemptFailed(
      db,
      {
        ...attempt,
        error: err,
        metadata: {
          conditionOperator: condition.operator,
          rulesCount: condition.rules.length,
          totalCount,
          successCount,
        },
      },
      undefined,
    );
    await updateBroadcastStatus(db, broadcastId, 'draft');
    throw err;
  }

  return (await getBroadcastById(db, broadcastId))!;
}
