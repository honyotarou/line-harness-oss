/**
 * イベントバス — システム内イベントの発火と処理
 *
 * イベント発生時に以下を実行:
 * 1. アクティブな送信Webhookへ通知
 * 2. スコアリングルール適用
 * 3. 自動化ルール(IF-THEN)実行
 * 4. 通知ルール処理
 */

import {
  getActiveOutgoingWebhooksByEvent,
  applyScoring,
  getActiveAutomationsByEvent,
  createAutomationLog,
  getActiveNotificationRulesByEvent,
  createNotification,
  addTagToFriend,
  removeTagFromFriend,
  enrollFriendInScenario,
  jstNow,
} from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';
import { fetchHttpsUrlAfterDnsAssertion } from './outbound-https-fetch.js';
import { parseStringArrayJson, tryParseJsonLoose, tryParseJsonRecord } from './safe-json.js';

export interface EventPayload {
  friendId?: string;
  eventData?: Record<string, unknown>;
}

/**
 * Automation `conditions` JSON must be explicit: empty `{}` does not match (prevents “always on” backdoors).
 * Use `{ "match_always": true }` only when an admin intentionally wants every event of that type to run the rule.
 * Unknown keys are rejected. Supported: `score_threshold`, `tag_id`.
 */
export function matchAutomationConditions(
  conditions: Record<string, unknown>,
  payload: EventPayload,
): boolean {
  if (conditions.match_always === true) {
    return true;
  }

  const keys = Object.keys(conditions);
  if (keys.length === 0) {
    return false;
  }

  const allowedKeys = new Set(['score_threshold', 'tag_id']);
  for (const k of keys) {
    if (!allowedKeys.has(k)) {
      return false;
    }
  }

  if (conditions.score_threshold !== undefined && payload.eventData) {
    const currentScore = payload.eventData.currentScore as number | undefined;
    if (currentScore !== undefined && currentScore < (conditions.score_threshold as number)) {
      return false;
    }
  }

  if (conditions.tag_id !== undefined && payload.eventData) {
    if (payload.eventData.tagId !== conditions.tag_id) return false;
  }

  return true;
}

/**
 * イベントを発火し、登録された全ハンドラーを実行
 */
export async function fireEvent(
  db: D1Database,
  eventType: string,
  payload: EventPayload,
  lineAccessToken?: string,
  lineAccountId?: string | null,
): Promise<void> {
  await Promise.allSettled([
    fireOutgoingWebhooks(db, eventType, payload),
    processScoring(db, eventType, payload),
    processAutomations(db, eventType, payload, lineAccessToken, lineAccountId),
    processNotifications(db, eventType, payload, lineAccountId),
  ]);
}

/** 送信Webhookへの通知 */
async function fireOutgoingWebhooks(
  db: D1Database,
  eventType: string,
  payload: EventPayload,
): Promise<void> {
  try {
    const webhooks = await getActiveOutgoingWebhooksByEvent(db, eventType);
    for (const wh of webhooks) {
      try {
        const body = JSON.stringify({
          event: eventType,
          timestamp: jstNow(),
          data: payload,
        });

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };

        // HMAC署名（シークレットがある場合）
        if (wh.secret) {
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(wh.secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
          );
          const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
          const hexSignature = Array.from(new Uint8Array(signature))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          headers['X-Webhook-Signature'] = hexSignature;
        }

        const outbound = await fetchHttpsUrlAfterDnsAssertion(wh.url, fetch, {
          method: 'POST',
          headers,
          body,
        });
        if (!outbound.ok) {
          console.error(`送信Webhook ${wh.id} skipped: ${outbound.reason}`);
          continue;
        }
      } catch (err) {
        console.error(`送信Webhook ${wh.id} への通知失敗:`, err);
      }
    }
  } catch (err) {
    console.error('fireOutgoingWebhooks error:', err);
  }
}

/** スコアリングルール適用 */
async function processScoring(
  db: D1Database,
  eventType: string,
  payload: EventPayload,
): Promise<void> {
  if (!payload.friendId) return;
  try {
    await applyScoring(db, payload.friendId, eventType);
  } catch (err) {
    console.error('processScoring error:', err);
  }
}

/** 自動化ルール(IF-THEN)実行 */
async function processAutomations(
  db: D1Database,
  eventType: string,
  payload: EventPayload,
  lineAccessToken?: string,
  lineAccountId?: string | null,
): Promise<void> {
  try {
    const allAutomations = await getActiveAutomationsByEvent(db, eventType);
    // Filter by account: match this account's automations + unassigned (backward compat)
    const automations = allAutomations.filter(
      (a) => !a.line_account_id || !lineAccountId || a.line_account_id === lineAccountId,
    );

    for (const automation of automations) {
      let conditionsParsed: unknown;
      let actionsParsed: unknown;
      try {
        conditionsParsed = JSON.parse(automation.conditions);
        actionsParsed = JSON.parse(automation.actions);
      } catch {
        await createAutomationLog(db, {
          automationId: automation.id,
          friendId: payload.friendId,
          eventData: JSON.stringify(payload.eventData ?? {}),
          actionsResult: JSON.stringify([
            {
              action: '_parse',
              success: false,
              error: 'Invalid automation conditions or actions JSON',
            },
          ]),
          status: 'failed',
        });
        continue;
      }

      const conditionsOk =
        conditionsParsed !== null &&
        typeof conditionsParsed === 'object' &&
        !Array.isArray(conditionsParsed);
      const actionsOk = Array.isArray(actionsParsed);
      if (!conditionsOk || !actionsOk) {
        await createAutomationLog(db, {
          automationId: automation.id,
          friendId: payload.friendId,
          eventData: JSON.stringify(payload.eventData ?? {}),
          actionsResult: JSON.stringify([
            {
              action: '_parse',
              success: false,
              error: 'Automation conditions must be a JSON object and actions a JSON array',
            },
          ]),
          status: 'failed',
        });
        continue;
      }

      const conditions = conditionsParsed as Record<string, unknown>;
      const actions = actionsParsed as Array<{ type: string; params: Record<string, string> }>;

      if (!matchAutomationConditions(conditions, payload)) continue;

      const results: Array<{ action: string; success: boolean; error?: string }> = [];

      for (const action of actions) {
        try {
          await executeAction(db, action, payload, lineAccessToken);
          results.push({ action: action.type, success: true });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          results.push({ action: action.type, success: false, error: errorMsg });
        }
      }

      const allSuccess = results.every((r) => r.success);
      const anySuccess = results.some((r) => r.success);

      await createAutomationLog(db, {
        automationId: automation.id,
        friendId: payload.friendId,
        eventData: JSON.stringify(payload.eventData ?? {}),
        actionsResult: JSON.stringify(results),
        status: allSuccess ? 'success' : anySuccess ? 'partial' : 'failed',
      });
    }
  } catch (err) {
    console.error('processAutomations error:', err);
  }
}

/** アクション実行 */
async function executeAction(
  db: D1Database,
  action: { type: string; params: Record<string, string> },
  payload: EventPayload,
  lineAccessToken?: string,
): Promise<void> {
  const friendId = payload.friendId;
  if (!friendId && action.type !== 'send_webhook') {
    throw new Error('friendId is required for this action');
  }

  switch (action.type) {
    case 'add_tag':
      await addTagToFriend(db, friendId!, action.params.tagId);
      break;

    case 'remove_tag':
      await removeTagFromFriend(db, friendId!, action.params.tagId);
      break;

    case 'start_scenario':
      await enrollFriendInScenario(db, friendId!, action.params.scenarioId);
      break;

    case 'send_message': {
      if (!lineAccessToken || !friendId) break;
      const friend = await db
        .prepare('SELECT line_user_id FROM friends WHERE id = ?')
        .bind(friendId)
        .first<{ line_user_id: string }>();
      if (!friend) break;
      const lineClient = new LineClient(lineAccessToken);
      const msgType = action.params.messageType || 'text';
      if (msgType === 'flex') {
        const contentsRaw = tryParseJsonLoose(action.params.content);
        if (contentsRaw === null || typeof contentsRaw !== 'object' || Array.isArray(contentsRaw)) {
          throw new Error('Invalid flex JSON in automation send_message');
        }
        const contents = contentsRaw;
        await lineClient.pushMessage(friend.line_user_id, [
          { type: 'flex', altText: action.params.altText || 'Message', contents },
        ]);
      } else {
        // Default: text message
        await lineClient.pushMessage(friend.line_user_id, [
          { type: 'text', text: action.params.content },
        ]);
      }
      break;
    }

    case 'send_webhook': {
      const url = action.params.url?.trim() ?? '';
      if (!url) {
        throw new Error('send_webhook requires params.url');
      }
      const outbound = await fetchHttpsUrlAfterDnsAssertion(url, fetch, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId, ...payload.eventData }),
      });
      if (!outbound.ok) {
        throw new Error(outbound.reason);
      }
      break;
    }

    case 'switch_rich_menu': {
      if (!lineAccessToken || !friendId) break;
      const friend = await db
        .prepare('SELECT line_user_id FROM friends WHERE id = ?')
        .bind(friendId)
        .first<{ line_user_id: string }>();
      if (!friend) break;
      const lineClient = new LineClient(lineAccessToken);
      await lineClient.linkRichMenuToUser(friend.line_user_id, action.params.richMenuId);
      break;
    }

    case 'remove_rich_menu': {
      if (!lineAccessToken || !friendId) break;
      const friend = await db
        .prepare('SELECT line_user_id FROM friends WHERE id = ?')
        .bind(friendId)
        .first<{ line_user_id: string }>();
      if (!friend) break;
      const lineClient = new LineClient(lineAccessToken);
      await lineClient.unlinkRichMenuFromUser(friend.line_user_id);
      break;
    }

    case 'set_metadata': {
      if (!friendId) break;
      const existing = await db
        .prepare('SELECT metadata FROM friends WHERE id = ?')
        .bind(friendId)
        .first<{ metadata: string }>();
      const current = tryParseJsonRecord(existing?.metadata || '{}') ?? {};
      const patch = tryParseJsonRecord(action.params.data || '{}');
      if (patch === null) {
        throw new Error('set_metadata params.data must be a JSON object');
      }
      const merged = { ...current, ...patch };
      await db
        .prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify(merged), jstNow(), friendId)
        .run();
      break;
    }

    default:
      throw new Error(`Unknown automation action type: ${action.type}`);
  }
}

/** 通知ルール処理 */
async function processNotifications(
  db: D1Database,
  eventType: string,
  payload: EventPayload,
  lineAccountId?: string | null,
): Promise<void> {
  try {
    const allRules = await getActiveNotificationRulesByEvent(db, eventType);
    const rules = allRules.filter(
      (r) => !r.line_account_id || !lineAccountId || r.line_account_id === lineAccountId,
    );

    for (const rule of rules) {
      const channels = parseStringArrayJson(rule.channels);
      if (!channels) {
        console.error(`processNotifications: invalid channels JSON for rule ${rule.id}`);
        continue;
      }

      for (const channel of channels) {
        await createNotification(db, {
          ruleId: rule.id,
          eventType,
          title: `${rule.name}: ${eventType}`,
          body: JSON.stringify(payload),
          channel,
          lineAccountId: lineAccountId ?? null,
          metadata: JSON.stringify(payload.eventData ?? {}),
        });

        // Webhook通知チャネルの場合は即時配信
        if (channel === 'webhook') {
          // 送信Webhookと統合（既にfireOutgoingWebhooksで処理済み）
        }
        // email チャネルの場合はSendGrid等で送信（将来実装）
        // dashboard チャネルの場合はDB記録のみ（上記createNotificationで完了）
      }
    }
  } catch (err) {
    console.error('processNotifications error:', err);
  }
}
