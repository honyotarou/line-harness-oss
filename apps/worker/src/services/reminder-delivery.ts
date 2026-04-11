/**
 * リマインダ配信処理 — cronトリガーで定期実行
 *
 * target_date + offset_minutes の時刻が現在時刻以前で
 * まだ配信されていないステップを配信する
 */

import {
  getDueReminderDeliveriesByAccount,
  markReminderStepDelivered,
  completeReminderIfDone,
  getFriendById,
  jstNow,
} from '@line-crm/db';
import type { LineClient } from '@line-crm/line-sdk';
import { addJitter, sleep } from './stealth.js';
import { buildMessageFromStoredContent } from './stored-line-message.js';
import {
  beginDeliveryAttempt,
  markDeliveryAttemptFailed,
  markDeliveryAttemptSucceeded,
} from './delivery-reliability.js';

export async function processReminderDeliveries(
  db: D1Database,
  lineClient: LineClient,
  lineAccountId?: string | null,
): Promise<void> {
  const now = jstNow();

  // Avoid night push by default (product requirement).
  // Quiet hours: 21:00-07:59 JST.
  // `jstNow()` returns an ISO-like string with `+09:00`.
  // Never rely on host timezone (CI can be UTC). Extract the JST hour directly.
  const hourMatch = now.match(/T(\d{2}):(\d{2}):(\d{2})/);
  const hour = hourMatch ? Number(hourMatch[1]) : Number.NaN;
  if (hour >= 21 || hour < 8) {
    return;
  }

  const dueReminders = await getDueReminderDeliveriesByAccount(db, now, lineAccountId);

  for (let i = 0; i < dueReminders.length; i++) {
    const fr = dueReminders[i];
    try {
      // ステルス: バースト回避のためランダム遅延
      if (i > 0) {
        await sleep(addJitter(50, 200));
      }

      const friend = await getFriendById(db, fr.friend_id);
      if (!friend || !friend.is_following) {
        // フォロー解除済み — スキップ
        continue;
      }

      for (const step of fr.steps) {
        const lineAccountForDelivery = lineAccountId ?? friend.line_account_id ?? null;
        const attempt = {
          idempotencyKey: `reminder:${fr.id}:${step.id}`,
          jobName: 'reminder_deliveries',
          sourceType: 'friend_reminder',
          sourceId: fr.id,
          friendId: friend.id,
          lineAccountId: lineAccountForDelivery,
          metadata: {
            reminderId: fr.reminder_id,
            reminderStepId: step.id,
          },
        };
        const reserved = await beginDeliveryAttempt(db, attempt);
        if (!reserved) {
          continue;
        }

        const message = buildMessageFromStoredContent(step.message_type, step.message_content, {
          flexAltFallback: 'Reminder',
        });
        try {
          await lineClient.pushMessage(friend.line_user_id, [message]);

          // メッセージログに記録
          const logId = crypto.randomUUID();
          await db
            .prepare(
              `INSERT INTO messages_log (id, friend_id, direction, message_type, content, created_at)
               VALUES (?, ?, 'outgoing', ?, ?, ?)`,
            )
            .bind(logId, friend.id, step.message_type, step.message_content, jstNow())
            .run();

          // 配信済みを記録
          await markReminderStepDelivered(db, fr.id, step.id);
          await markDeliveryAttemptSucceeded(db, { idempotencyKey: attempt.idempotencyKey });
        } catch (err) {
          await markDeliveryAttemptFailed(db, { ...attempt, error: err }, undefined);
          throw err;
        }
      }

      // 全ステップ配信済みかチェック
      await completeReminderIfDone(db, fr.id, fr.reminder_id);
    } catch (err) {
      console.error(`リマインダ配信エラー (friend_reminder ${fr.id}):`, err);
    }
  }
}
