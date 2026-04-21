import { getBroadcastById, getFriendById, jstNow } from '@line-crm/db';
import type { LineClient } from '@line-crm/line-sdk';
import { buildMessageFromStoredContent } from './stored-line-message.js';

export type BroadcastTestPushResult = Readonly<{
  messageLogId: string;
}>;

export async function pushBroadcastTestToFriend(
  db: D1Database,
  lineClient: LineClient,
  broadcastId: string,
  friendId: string,
): Promise<BroadcastTestPushResult> {
  const broadcast = await getBroadcastById(db, broadcastId);
  if (!broadcast) {
    throw new Error('broadcast_not_found');
  }
  const friend = await getFriendById(db, friendId);
  if (!friend) {
    throw new Error('friend_not_found');
  }
  if (!friend.line_user_id?.trim()) {
    throw new Error('friend_missing_line_user_id');
  }
  if (!friend.is_following) {
    throw new Error('friend_not_following');
  }
  if (broadcast.line_account_id) {
    if (friend.line_account_id !== broadcast.line_account_id) {
      throw new Error('friend_line_account_mismatch');
    }
  }

  const message = buildMessageFromStoredContent(broadcast.message_type, broadcast.message_content, {
    flexAltFallback: 'Test',
  });
  await lineClient.pushMessage(friend.line_user_id.trim(), [message]);

  const logId = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
       VALUES (?, ?, 'outgoing', ?, ?, ?, NULL, ?)`,
    )
    .bind(logId, friend.id, broadcast.message_type, broadcast.message_content, broadcastId, now)
    .run();

  return { messageLogId: logId };
}
