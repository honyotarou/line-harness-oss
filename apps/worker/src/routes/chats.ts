import { Hono } from 'hono';
import {
  getOperators,
  getOperatorById,
  createOperator,
  updateOperator,
  deleteOperator,
  getChats,
  getChatById,
  createChat,
  updateChat,
  getFriendById,
  jstNow,
} from '@line-crm/db';
import type { Env } from '../index.js';
import { lineAccountDbOptions } from '../services/line-account-at-rest-key.js';
import { resolveLineAccessTokenForFriend } from '../services/line-account-routing.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import { clampListLimit, clampOffset } from '../services/query-limits.js';
import {
  resolveLineAccountScopeForRequest,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountBody,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';

const chats = new Hono<Env>();

// ========== オペレーターCRUD ==========

chats.get('/api/operators', async (c) => {
  try {
    const items = await getOperators(c.env.DB);
    return c.json({
      success: true,
      data: items.map((o) => ({
        id: o.id,
        name: o.name,
        email: o.email,
        role: o.role,
        isActive: Boolean(o.is_active),
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/operators error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

chats.post('/api/operators', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{ name: string; email: string; role?: string }>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    if (!body.name || !body.email)
      return c.json({ success: false, error: 'name and email are required' }, 400);
    const item = await createOperator(c.env.DB, body);
    return c.json(
      { success: true, data: { id: item.id, name: item.name, email: item.email, role: item.role } },
      201,
    );
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/operators error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

chats.put('/api/operators/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    await updateOperator(c.env.DB, id, body as never);
    const updated = await getOperatorById(c.env.DB, id);
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        isActive: Boolean(updated.is_active),
      },
    });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/operators/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

chats.delete('/api/operators/:id', async (c) => {
  try {
    await deleteOperator(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/operators/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== チャットCRUD ==========

chats.get('/api/chats', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const status = c.req.query('status') ?? undefined;
    const operatorId = c.req.query('operatorId') ?? undefined;
    const lineAccountId = c.req.query('lineAccountId') ?? undefined;
    const qList = validateScopedLineAccountQueryParam(scope, lineAccountId);
    if (!qList.ok) {
      return c.json({ success: false, error: qList.error }, qList.status);
    }

    // JOIN friends to get display_name and picture_url
    let sql = `SELECT c.*, f.display_name, f.picture_url, f.line_user_id
               FROM chats c
               LEFT JOIN friends f ON c.friend_id = f.id`;
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (status) {
      conditions.push('c.status = ?');
      bindings.push(status);
    }
    if (operatorId) {
      conditions.push('c.operator_id = ?');
      bindings.push(operatorId);
    }
    if (lineAccountId) {
      conditions.push('f.line_account_id = ?');
      bindings.push(lineAccountId);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY c.last_message_at DESC LIMIT ? OFFSET ?';
    const listLimit = clampListLimit(c.req.query('limit'), 200, 500);
    const listOffset = clampOffset(c.req.query('offset'), 500_000);
    bindings.push(listLimit, listOffset);

    const stmt = c.env.DB.prepare(sql).bind(...bindings);
    const result = await stmt.all();

    return c.json({
      success: true,
      data: result.results.map((ch: Record<string, unknown>) => ({
        id: ch.id,
        friendId: ch.friend_id,
        friendName: ch.display_name || '名前なし',
        friendPictureUrl: ch.picture_url || null,
        operatorId: ch.operator_id,
        status: ch.status,
        notes: ch.notes,
        lastMessageAt: ch.last_message_at,
        lineAccountId: ch.line_account_id ?? null,
        createdAt: ch.created_at,
        updatedAt: ch.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/chats error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

chats.get('/api/chats/:id', async (c) => {
  try {
    const scopeChat = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const item = await getChatById(c.env.DB, c.req.param('id'));
    if (!item) return c.json({ success: false, error: 'Chat not found' }, 404);

    const friendRow = await getFriendById(c.env.DB, item.friend_id);
    const effectiveLineAccountId = friendRow?.line_account_id ?? item.line_account_id ?? null;
    if (!resourceLineAccountVisibleInScope(scopeChat, effectiveLineAccountId)) {
      return c.json({ success: false, error: 'Chat not found' }, 404);
    }

    // 友だち情報を取得
    const friend = await c.env.DB.prepare(
      `SELECT display_name, picture_url, line_user_id FROM friends WHERE id = ?`,
    )
      .bind(item.friend_id)
      .first<{ display_name: string | null; picture_url: string | null; line_user_id: string }>();

    // チャットに関連するメッセージログも取得
    const messages = await c.env.DB.prepare(
      `SELECT id, friend_id, direction, message_type, content, created_at FROM messages_log WHERE friend_id = ? ORDER BY created_at ASC LIMIT 200`,
    )
      .bind(item.friend_id)
      .all();

    return c.json({
      success: true,
      data: {
        id: item.id,
        friendId: item.friend_id,
        friendName: friend?.display_name || '名前なし',
        friendPictureUrl: friend?.picture_url || null,
        operatorId: item.operator_id,
        status: item.status,
        notes: item.notes,
        lastMessageAt: item.last_message_at,
        lineAccountId: item.line_account_id ?? null,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        messages: (messages.results as Record<string, unknown>[]).map((m) => ({
          id: m.id,
          direction: m.direction,
          messageType: m.message_type,
          content: m.content,
          createdAt: m.created_at,
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/chats/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

chats.post('/api/chats', async (c) => {
  try {
    const scopePost = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const body = await readJsonBodyWithLimit<{
      friendId: string;
      operatorId?: string;
      lineAccountId?: string | null;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    if (!body.friendId) return c.json({ success: false, error: 'friendId is required' }, 400);

    const scoped = validateScopedLineAccountBody(scopePost, body.lineAccountId ?? null);
    if (!scoped.ok) {
      return c.json({ success: false, error: scoped.error }, scoped.status);
    }
    if (scopePost.mode === 'restricted' && !scoped.lineAccountId) {
      return c.json({ success: false, error: 'lineAccountId is required for this principal' }, 400);
    }

    const friendForChat = await getFriendById(c.env.DB, body.friendId);
    if (!friendForChat) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }
    if (!resourceLineAccountVisibleInScope(scopePost, friendForChat.line_account_id)) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }
    if (scopePost.mode === 'restricted' && friendForChat.line_account_id !== scoped.lineAccountId) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }
    if (
      body.lineAccountId &&
      friendForChat.line_account_id &&
      body.lineAccountId !== friendForChat.line_account_id
    ) {
      return c.json(
        { success: false, error: 'lineAccountId does not match the friend LINE account' },
        400,
      );
    }

    const item = await createChat(c.env.DB, body);
    const lineAccToStore =
      scoped.lineAccountId ?? body.lineAccountId ?? friendForChat.line_account_id ?? null;
    if (lineAccToStore) {
      await c.env.DB.prepare(`UPDATE chats SET line_account_id = ? WHERE id = ?`)
        .bind(lineAccToStore, item.id)
        .run();
    }
    return c.json(
      {
        success: true,
        data: {
          id: item.id,
          friendId: item.friend_id,
          operatorId: item.operator_id,
          status: item.status,
          notes: item.notes,
          lastMessageAt: item.last_message_at,
          lineAccountId: lineAccToStore ?? item.line_account_id ?? null,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        },
      },
      201,
    );
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/chats error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// チャットのアサイン/ステータス更新/ノート更新
chats.put('/api/chats/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const scopePutChat = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const existingChat = await getChatById(c.env.DB, id);
    if (!existingChat) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }
    const friendPut = await getFriendById(c.env.DB, existingChat.friend_id);
    const effPut = friendPut?.line_account_id ?? existingChat.line_account_id ?? null;
    if (!resourceLineAccountVisibleInScope(scopePutChat, effPut)) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }

    const body = await readJsonBodyWithLimit<{
      operatorId?: string | null;
      status?: string;
      notes?: string;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    await updateChat(c.env.DB, id, body);
    const updated = await getChatById(c.env.DB, id);
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({
      success: true,
      data: {
        id: updated.id,
        friendId: updated.friend_id,
        operatorId: updated.operator_id,
        status: updated.status,
        notes: updated.notes,
        lastMessageAt: updated.last_message_at,
        lineAccountId: updated.line_account_id ?? null,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/chats/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// オペレーターからメッセージ送信
chats.post('/api/chats/:id/send', async (c) => {
  try {
    const chatId = c.req.param('id');
    const scopeSendChat = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const chat = await getChatById(c.env.DB, chatId);
    if (!chat) return c.json({ success: false, error: 'Chat not found' }, 404);
    const friendSend = await getFriendById(c.env.DB, chat.friend_id);
    const effSend = friendSend?.line_account_id ?? chat.line_account_id ?? null;
    if (!resourceLineAccountVisibleInScope(scopeSendChat, effSend)) {
      return c.json({ success: false, error: 'Chat not found' }, 404);
    }

    const body = await readJsonBodyWithLimit<{ messageType?: string; content: string }>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    if (!body.content) return c.json({ success: false, error: 'content is required' }, 400);

    const friend = await c.env.DB.prepare(`SELECT * FROM friends WHERE id = ?`)
      .bind(chat.friend_id)
      .first<{ id: string; line_user_id: string }>();
    if (!friend) return c.json({ success: false, error: 'Friend not found' }, 404);

    // LINE APIでメッセージ送信
    const { LineClient } = await import('@line-crm/line-sdk');
    const accessToken = await resolveLineAccessTokenForFriend(
      c.env.DB,
      c.env.LINE_CHANNEL_ACCESS_TOKEN,
      friend.id,
      lineAccountDbOptions(c.env),
    );
    const lineClient = new LineClient(accessToken);
    const messageType = body.messageType ?? 'text';

    if (messageType === 'text') {
      await lineClient.pushTextMessage(friend.line_user_id, body.content);
    } else if (messageType === 'flex') {
      let contents: unknown;
      try {
        contents = JSON.parse(body.content);
      } catch {
        return c.json({ success: false, error: 'Invalid flex JSON in content' }, 400);
      }
      if (contents === null || typeof contents !== 'object' || Array.isArray(contents)) {
        return c.json({ success: false, error: 'Flex content must be a single JSON object' }, 400);
      }
      await lineClient.pushFlexMessage(friend.line_user_id, 'Message', contents);
    }

    // メッセージログに記録
    const logId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO messages_log (id, friend_id, direction, message_type, content, created_at) VALUES (?, ?, 'outgoing', ?, ?, ?)`,
    )
      .bind(logId, friend.id, messageType, body.content, jstNow())
      .run();

    // チャットの最終メッセージ日時を更新
    await updateChat(c.env.DB, chatId, { status: 'in_progress', lastMessageAt: jstNow() });

    return c.json({ success: true, data: { sent: true, messageId: logId } });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/chats/:id/send error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { chats };
