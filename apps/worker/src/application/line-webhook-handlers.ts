import { LineClient } from '@line-crm/line-sdk';
import type { WebhookEvent, TextEventMessage, PostbackEvent } from '@line-crm/line-sdk';
import {
  upsertFriend,
  updateFriendFollowStatus,
  getFriendByLineUserId,
  getScenarios,
  enrollFriendInScenario,
  getScenarioSteps,
  advanceFriendScenario,
  completeFriendScenario,
  upsertChatOnMessage,
  getLineAccountById,
  jstNow,
} from '@line-crm/db';
import { buildAuthUrlChannelAllowlist } from '../services/auth-url-allowlist.js';
import { fireEvent } from '../services/event-bus.js';
import { buildMessage, expandVariables } from '../services/step-delivery.js';
import type { Env } from '../index.js';
import { tryParseJsonRecord } from '../services/safe-json.js';
import {
  welcomeAnxietyFlowEnabled,
  buildWelcomeAnxietyFlexMessage,
  buildAnxietyFollowupFlexMessage,
  parseAnxietyPostbackData,
} from '../services/welcome-anxiety-flow.js';
import { tryConsumeLineWebhookEvent } from '../services/line-webhook-dedup.js';

/**
 * LINE webhook event handler (follow / unfollow / postback / text message).
 * Kept out of the HTTP route so the route stays I/O and orchestration only.
 */
export async function handleLineWebhookEvent(
  db: D1Database,
  lineClient: LineClient,
  event: WebhookEvent,
  lineAccessToken: string,
  lineAccountId: string | null = null,
  workerUrl?: string,
  bindings?: Env['Bindings'],
): Promise<void> {
  const shouldRun = await tryConsumeLineWebhookEvent(db, event);
  if (!shouldRun) {
    return;
  }

  if (event.type === 'follow') {
    const userId = event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    // プロフィール取得 & 友だち登録/更新
    let profile;
    try {
      profile = await lineClient.getProfile(userId);
    } catch (err) {
      console.error('Failed to get profile for', userId, err);
    }

    const friend = await upsertFriend(db, {
      lineUserId: userId,
      displayName: profile?.displayName ?? null,
      pictureUrl: profile?.pictureUrl ?? null,
      statusMessage: profile?.statusMessage ?? null,
    });

    // Set line_account_id for multi-account tracking
    if (lineAccountId) {
      await db
        .prepare('UPDATE friends SET line_account_id = ? WHERE id = ? AND line_account_id IS NULL')
        .bind(lineAccountId, friend.id)
        .run();
    }

    /** When set, consumes `replyToken` for branded welcome Flex; scenario step 0 (delay=0) must not reply again. */
    let welcomeAnxietyConsumedReply = false;
    if (bindings && welcomeAnxietyFlowEnabled(bindings)) {
      try {
        const welcomeMsg = buildWelcomeAnxietyFlexMessage(bindings);
        await lineClient.replyMessage(event.replyToken, [welcomeMsg]);
        welcomeAnxietyConsumedReply = true;
        const welcomeLogId = crypto.randomUUID();
        const welcomeContent =
          welcomeMsg.type === 'flex' ? JSON.stringify(welcomeMsg.contents) : '';
        await db
          .prepare(
            `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
             VALUES (?, ?, 'outgoing', 'flex', ?, NULL, NULL, ?)`,
          )
          .bind(welcomeLogId, friend.id, welcomeContent, jstNow())
          .run();
      } catch (err) {
        console.error('Failed welcome anxiety flex on follow', err);
      }
    }

    // friend_add シナリオに登録（このアカウントのシナリオのみ）
    const scenarios = await getScenarios(db);
    for (const scenario of scenarios) {
      // Only trigger scenarios belonging to this account (or unassigned for backward compat)
      const scenarioAccountMatch =
        !scenario.line_account_id || !lineAccountId || scenario.line_account_id === lineAccountId;
      if (scenario.trigger_type === 'friend_add' && scenario.is_active && scenarioAccountMatch) {
        try {
          const existing = await db
            .prepare(`SELECT id FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?`)
            .bind(friend.id, scenario.id)
            .first<{ id: string }>();
          if (!existing) {
            const friendScenario = await enrollFriendInScenario(db, friend.id, scenario.id);

            // Immediate delivery: if the first step has delay=0, send it now via replyMessage (free)
            const steps = await getScenarioSteps(db, scenario.id);
            const firstStep = steps[0];
            if (firstStep && firstStep.delay_minutes === 0 && friendScenario.status === 'active') {
              try {
                if (!welcomeAnxietyConsumedReply) {
                  const expandedContent = expandVariables(
                    firstStep.message_content,
                    friend as { id: string; display_name: string | null; user_id: string | null },
                  );
                  const message = buildMessage(firstStep.message_type, expandedContent);
                  await lineClient.replyMessage(event.replyToken, [message]);
                  console.log(`Immediate delivery: sent step ${firstStep.id} to ${userId}`);

                  // Log outgoing message
                  const logId = crypto.randomUUID();
                  await db
                    .prepare(
                      `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
                       VALUES (?, ?, 'outgoing', ?, ?, NULL, ?, ?)`,
                    )
                    .bind(
                      logId,
                      friend.id,
                      firstStep.message_type,
                      firstStep.message_content,
                      firstStep.id,
                      jstNow(),
                    )
                    .run();
                } else {
                  console.log(
                    `Skipped immediate scenario step ${firstStep.id} (welcome anxiety flow used reply token)`,
                  );
                }

                // Advance or complete the friend_scenario
                const secondStep = steps[1] ?? null;
                if (secondStep) {
                  const nextDeliveryDate = new Date(Date.now() + 9 * 60 * 60_000);
                  nextDeliveryDate.setMinutes(
                    nextDeliveryDate.getMinutes() + secondStep.delay_minutes,
                  );
                  // Enforce 9:00-21:00 JST delivery window
                  const h = nextDeliveryDate.getUTCHours();
                  if (h < 9 || h >= 21) {
                    if (h >= 21) nextDeliveryDate.setUTCDate(nextDeliveryDate.getUTCDate() + 1);
                    nextDeliveryDate.setUTCHours(9, 0, 0, 0);
                  }
                  await advanceFriendScenario(
                    db,
                    friendScenario.id,
                    firstStep.step_order,
                    nextDeliveryDate.toISOString().slice(0, -1) + '+09:00',
                  );
                } else {
                  await completeFriendScenario(db, friendScenario.id);
                }
              } catch (err) {
                console.error('Failed immediate delivery for scenario', scenario.id, err);
              }
            }
          }
        } catch (err) {
          console.error('Failed to enroll friend in scenario', scenario.id, err);
        }
      }
    }

    // イベントバス発火: friend_add
    await fireEvent(
      db,
      'friend_add',
      { friendId: friend.id, eventData: { displayName: friend.display_name } },
      lineAccessToken,
      lineAccountId,
    );
    return;
  }

  if (event.type === 'unfollow') {
    const userId = event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    await updateFriendFollowStatus(db, userId, false);
    return;
  }

  if (event.type === 'postback') {
    const pb = event as PostbackEvent;
    const userId = event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    const anxietyKey = parseAnxietyPostbackData(pb.postback.data);
    if (!anxietyKey) return;

    const friend = await getFriendByLineUserId(db, userId);
    if (!friend) return;

    const metaRow = await db
      .prepare('SELECT metadata FROM friends WHERE id = ?')
      .bind(friend.id)
      .first<{ metadata: string | null }>();
    const meta = tryParseJsonRecord(metaRow?.metadata || '{}') ?? {};
    meta.anxiety = anxietyKey;
    meta.anxiety_selected_at = jstNow();
    await db
      .prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(meta), jstNow(), friend.id)
      .run();

    try {
      const followup = buildAnxietyFollowupFlexMessage(
        anxietyKey,
        bindings ?? { LIFF_URL: '', WORKER_URL: workerUrl ?? '' },
      );
      await lineClient.replyMessage(pb.replyToken, [followup]);
      const outLogId = crypto.randomUUID();
      const followContent = followup.type === 'flex' ? JSON.stringify(followup.contents) : '';
      await db
        .prepare(
          `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
           VALUES (?, ?, 'outgoing', 'flex', ?, NULL, NULL, ?)`,
        )
        .bind(outLogId, friend.id, followContent, jstNow())
        .run();
    } catch (err) {
      console.error('Failed anxiety follow-up flex', err);
    }
    return;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const textMessage = event.message as TextEventMessage;
    const userId = event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    const friend = await getFriendByLineUserId(db, userId);
    if (!friend) return;

    const incomingText = textMessage.text;
    const now = jstNow();
    const logId = crypto.randomUUID();

    // 受信メッセージをログに記録
    await db
      .prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
         VALUES (?, ?, 'incoming', 'text', ?, NULL, NULL, ?)`,
      )
      .bind(logId, friend.id, incomingText, now)
      .run();

    // チャットを作成/更新（オペレーター機能連携）
    await upsertChatOnMessage(db, friend.id);

    // 配信時間設定: 「配信時間は○時」「○時に届けて」等のパターンを検出
    const timeMatch = incomingText.match(/(?:配信時間|配信|届けて|通知)[はを]?\s*(\d{1,2})\s*時/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      if (hour >= 6 && hour <= 22) {
        // Save preferred_hour to friend metadata
        const existing = await db
          .prepare('SELECT metadata FROM friends WHERE id = ?')
          .bind(friend.id)
          .first<{ metadata: string }>();
        const meta = tryParseJsonRecord(existing?.metadata || '{}') ?? {};
        meta.preferred_hour = hour;
        await db
          .prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
          .bind(JSON.stringify(meta), jstNow(), friend.id)
          .run();

        // Reply with confirmation
        try {
          const period = hour < 12 ? '午前' : '午後';
          const displayHour = hour <= 12 ? hour : hour - 12;
          await lineClient.replyMessage(event.replyToken, [
            buildMessage(
              'flex',
              JSON.stringify({
                type: 'bubble',
                body: {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: '配信時間を設定しました',
                      size: 'lg',
                      weight: 'bold',
                      color: '#1e293b',
                    },
                    {
                      type: 'box',
                      layout: 'vertical',
                      contents: [
                        {
                          type: 'text',
                          text: `${period} ${displayHour}:00`,
                          size: 'xxl',
                          weight: 'bold',
                          color: '#f59e0b',
                          align: 'center',
                        },
                        {
                          type: 'text',
                          text: `（${hour}:00〜）`,
                          size: 'sm',
                          color: '#64748b',
                          align: 'center',
                          margin: 'sm',
                        },
                      ],
                      backgroundColor: '#fffbeb',
                      cornerRadius: 'md',
                      paddingAll: '20px',
                      margin: 'lg',
                    },
                    {
                      type: 'text',
                      text: '今後のステップ配信はこの時間以降にお届けします。',
                      size: 'xs',
                      color: '#64748b',
                      wrap: true,
                      margin: 'lg',
                    },
                  ],
                  paddingAll: '20px',
                },
              }),
            ),
          ]);
        } catch (err) {
          console.error('Failed to reply for time setting', err);
        }
        return;
      }
    }

    // 自動返信チェック（このアカウントのルール + グローバルルールのみ）
    // NOTE: Auto-replies use replyMessage (free, no quota) instead of pushMessage
    // The replyToken is only valid for ~1 minute after the message event
    const autoReplyStmt = lineAccountId
      ? db
          .prepare(
            'SELECT * FROM auto_replies WHERE is_active = 1 AND (line_account_id IS NULL OR line_account_id = ?) ORDER BY created_at ASC',
          )
          .bind(lineAccountId)
      : db.prepare(
          'SELECT * FROM auto_replies WHERE is_active = 1 AND line_account_id IS NULL ORDER BY created_at ASC',
        );
    const autoReplies = await autoReplyStmt.all<{
      id: string;
      keyword: string;
      match_type: 'exact' | 'contains';
      response_type: string;
      response_content: string;
      is_active: number;
      created_at: string;
    }>();

    let fallbackChannel = bindings?.LINE_CHANNEL_ID?.trim() ?? '';
    if (lineAccountId) {
      const acc = await getLineAccountById(db, lineAccountId);
      if (acc?.channel_id?.trim()) {
        fallbackChannel = acc.channel_id.trim();
      }
    }
    const authUrlAllowlist = await buildAuthUrlChannelAllowlist(
      db,
      { line_account_id: (friend as { line_account_id?: string | null }).line_account_id },
      fallbackChannel,
    );

    let matched = false;
    for (const rule of autoReplies.results) {
      const isMatch =
        rule.match_type === 'exact'
          ? incomingText === rule.keyword
          : incomingText.includes(rule.keyword);

      if (isMatch) {
        try {
          // Expand template variables ({{name}}, {{uid}}, {{auth_url:CHANNEL_ID}})
          const expandedContent = expandVariables(
            rule.response_content,
            friend as { id: string; display_name: string | null; user_id: string | null },
            workerUrl,
            { allowedAuthUrlChannelIds: authUrlAllowlist },
          );
          const replyMsg = buildMessage(rule.response_type, expandedContent);
          await lineClient.replyMessage(event.replyToken, [replyMsg]);

          // 送信ログ
          const outLogId = crypto.randomUUID();
          await db
            .prepare(
              `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
               VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, ?)`,
            )
            .bind(outLogId, friend.id, rule.response_type, expandedContent, jstNow())
            .run();
        } catch (err) {
          console.error('Failed to send auto-reply', err);
        }

        matched = true;
        break;
      }
    }

    // イベントバス発火: message_received
    await fireEvent(
      db,
      'message_received',
      {
        friendId: friend.id,
        eventData: { text: incomingText, matched },
      },
      lineAccessToken,
      lineAccountId,
    );

    return;
  }
}
