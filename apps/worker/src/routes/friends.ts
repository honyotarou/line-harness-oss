import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  getFriends,
  getFriendById,
  getFriendCount,
  addTagToFriend,
  removeTagFromFriend,
  getFriendTags,
  getTagsForFriends,
  getScenarios,
  enrollFriendInScenario,
  jstNow,
} from '@line-crm/db';
import type { Friend as DbFriend, Tag as DbTag } from '@line-crm/db';
import { fireEvent } from '../services/event-bus.js';
import { buildMessage } from '../services/step-delivery.js';
import type { Env } from '../index.js';
import { resolveLineAccessTokenForFriend } from '../services/line-account-routing.js';
import { tryParseJsonRecord } from '../services/safe-json.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import { mergeFriendMetadataPatch } from '../services/friend-metadata-merge.js';
import { clampListLimit, clampOffset } from '../services/query-limits.js';
import {
  resolveLineAccountScopeForRequest,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';

const friends = new Hono<Env>();

async function jsonIfLineAccountQueryInvalid(
  c: Context<Env>,
  lineAccountId: string | null | undefined,
): Promise<Response | null> {
  const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
  const r = validateScopedLineAccountQueryParam(scope, lineAccountId);
  if (!r.ok) {
    return c.json({ success: false, error: r.error }, r.status);
  }
  return null;
}

async function jsonIfFriendOutOfScope(
  c: Context<Env>,
  friend: DbFriend | null,
): Promise<Response | null> {
  if (!friend) {
    return c.json({ success: false, error: 'Friend not found' }, 404);
  }
  const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
  if (!resourceLineAccountVisibleInScope(scope, friend.line_account_id)) {
    return c.json({ success: false, error: 'Friend not found' }, 404);
  }
  return null;
}
const FRIEND_METADATA_PATCH_LIMIT_BYTES = 64 * 1024;

/** Convert a D1 snake_case Friend row to the shared camelCase shape */
function serializeFriend(row: DbFriend) {
  return {
    id: row.id,
    lineUserId: row.line_user_id,
    displayName: row.display_name,
    pictureUrl: row.picture_url,
    statusMessage: row.status_message,
    isFollowing: Boolean(row.is_following),
    lineAccountId: row.line_account_id,
    metadata: tryParseJsonRecord(row.metadata || '{}') ?? {},
    refCode: (row as unknown as Record<string, unknown>).ref_code as string | null,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Convert a D1 snake_case Tag row to the shared camelCase shape */
function serializeTag(row: DbTag) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}

// GET /api/friends - list with pagination
friends.get('/api/friends', async (c) => {
  try {
    const limit = clampListLimit(c.req.query('limit'), 50, 200);
    const offset = clampOffset(c.req.query('offset'), 500_000);
    const tagId = c.req.query('tagId');
    const lineAccountId = c.req.query('lineAccountId');

    const denied = await jsonIfLineAccountQueryInvalid(c, lineAccountId);
    if (denied) {
      return denied;
    }

    const db = c.env.DB;

    // Build WHERE conditions
    const conditions: string[] = [];
    const binds: unknown[] = [];
    if (tagId) {
      conditions.push(
        'EXISTS (SELECT 1 FROM friend_tags ft WHERE ft.friend_id = f.id AND ft.tag_id = ?)',
      );
      binds.push(tagId);
    }
    if (lineAccountId) {
      conditions.push('f.line_account_id = ?');
      binds.push(lineAccountId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM friends f ${where}`);
    const totalRow = await (binds.length > 0 ? countStmt.bind(...binds) : countStmt).first<{
      count: number;
    }>();
    const total = totalRow?.count ?? 0;

    const listStmt = db.prepare(
      `SELECT f.* FROM friends f ${where} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
    );
    const listBinds = [...binds, limit, offset];
    const listResult = await listStmt.bind(...listBinds).all<DbFriend>();
    const items = listResult.results;

    // Batch fetch all tags in a single query (avoids N+1)
    const friendIds = items.map((f) => f.id);
    const tagMap = await getTagsForFriends(db, friendIds);
    const itemsWithTags = items.map((friend) => {
      const tags = tagMap.get(friend.id) ?? [];
      return { ...serializeFriend(friend), tags: tags.map(serializeTag) };
    });

    return c.json({
      success: true,
      data: {
        items: itemsWithTags,
        total,
        page: Math.floor(offset / limit) + 1,
        limit,
        hasNextPage: offset + limit < total,
      },
    });
  } catch (err) {
    console.error('GET /api/friends error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/friends/count - friend count (must be before /:id)
friends.get('/api/friends/count', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');

    const denied = await jsonIfLineAccountQueryInvalid(c, lineAccountId);
    if (denied) {
      return denied;
    }

    let count: number;
    if (lineAccountId) {
      const row = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM friends WHERE is_following = 1 AND line_account_id = ?',
      )
        .bind(lineAccountId)
        .first<{ count: number }>();
      count = row?.count ?? 0;
    } else {
      count = await getFriendCount(c.env.DB);
    }
    return c.json({ success: true, data: { count } });
  } catch (err) {
    console.error('GET /api/friends/count error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/friends/ref-stats - ref code attribution stats
friends.get('/api/friends/ref-stats', async (c) => {
  try {
    const lineAccountId = c.req.query('lineAccountId');

    const denied = await jsonIfLineAccountQueryInvalid(c, lineAccountId);
    if (denied) {
      return denied;
    }

    const where = lineAccountId ? 'WHERE line_account_id = ?' : 'WHERE ref_code IS NOT NULL';
    const binds = lineAccountId ? [lineAccountId] : [];
    const stmt = c.env.DB.prepare(
      `SELECT ref_code, COUNT(*) as count FROM friends ${where} AND ref_code IS NOT NULL GROUP BY ref_code ORDER BY count DESC`,
    );
    const result = await (binds.length > 0 ? stmt.bind(...binds) : stmt).all<{
      ref_code: string;
      count: number;
    }>();
    const total = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM friends ${lineAccountId ? 'WHERE line_account_id = ?' : ''} ${lineAccountId ? 'AND' : 'WHERE'} ref_code IS NOT NULL`,
    )
      .bind(...(lineAccountId ? [lineAccountId] : []))
      .first<{ count: number }>();
    return c.json({
      success: true,
      data: {
        routes: result.results.map((r) => ({ refCode: r.ref_code, friendCount: r.count })),
        totalWithRef: total?.count ?? 0,
      },
    });
  } catch (err) {
    console.error('GET /api/friends/ref-stats error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/friends/:id - get single friend with tags
friends.get('/api/friends/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const db = c.env.DB;

    const [friend, tags] = await Promise.all([getFriendById(db, id), getFriendTags(db, id)]);

    const scopeDenied = await jsonIfFriendOutOfScope(c, friend);
    if (scopeDenied) {
      return scopeDenied;
    }

    const f = friend!;
    return c.json({
      success: true,
      data: {
        ...serializeFriend(f),
        tags: tags.map(serializeTag),
      },
    });
  } catch (err) {
    console.error('GET /api/friends/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/friends/:id/tags - add tag
friends.post('/api/friends/:id/tags', async (c) => {
  try {
    const friendId = c.req.param('id');
    const body = await readJsonBodyWithLimit<{ tagId: string }>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );

    if (!body.tagId) {
      return c.json({ success: false, error: 'tagId is required' }, 400);
    }

    const db = c.env.DB;
    const friend = await getFriendById(db, friendId);
    const scopeDenied = await jsonIfFriendOutOfScope(c, friend);
    if (scopeDenied) {
      return scopeDenied;
    }

    await addTagToFriend(db, friendId, body.tagId);

    // Enroll in tag_added scenarios that match this tag
    const allScenarios = await getScenarios(db);
    for (const scenario of allScenarios) {
      if (
        scenario.trigger_type === 'tag_added' &&
        scenario.is_active &&
        scenario.trigger_tag_id === body.tagId
      ) {
        const existing = await db
          .prepare(`SELECT id FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?`)
          .bind(friendId, scenario.id)
          .first();
        if (!existing) {
          await enrollFriendInScenario(db, friendId, scenario.id);
        }
      }
    }

    // イベントバス発火: tag_change
    await fireEvent(db, 'tag_change', {
      friendId,
      eventData: { tagId: body.tagId, action: 'add' },
    });

    return c.json({ success: true, data: null }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/friends/:id/tags error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/friends/:id/tags/:tagId - remove tag
friends.delete('/api/friends/:id/tags/:tagId', async (c) => {
  try {
    const friendId = c.req.param('id');
    const tagId = c.req.param('tagId');

    const friend = await getFriendById(c.env.DB, friendId);
    const scopeDenied = await jsonIfFriendOutOfScope(c, friend);
    if (scopeDenied) {
      return scopeDenied;
    }

    await removeTagFromFriend(c.env.DB, friendId, tagId);

    // イベントバス発火: tag_change
    await fireEvent(c.env.DB, 'tag_change', { friendId, eventData: { tagId, action: 'remove' } });

    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/friends/:id/tags/:tagId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/friends/:id/metadata - merge metadata fields
friends.put('/api/friends/:id/metadata', async (c) => {
  try {
    const friendId = c.req.param('id');
    const db = c.env.DB;

    const friend = await getFriendById(db, friendId);
    const scopeDeniedMeta = await jsonIfFriendOutOfScope(c, friend);
    if (scopeDeniedMeta) {
      return scopeDeniedMeta;
    }

    const friendRow = friend!;
    let body: Record<string, unknown>;
    try {
      body = await readJsonBodyWithLimit<Record<string, unknown>>(
        c.req.raw,
        FRIEND_METADATA_PATCH_LIMIT_BYTES,
      );
    } catch (err) {
      const jr = jsonBodyReadErrorResponse(err);
      if (jr) return c.json(jr.body, jr.status);
      throw err;
    }
    let existing: Record<string, unknown>;
    try {
      existing = JSON.parse(friendRow.metadata || '{}') as Record<string, unknown>;
    } catch {
      return c.json(
        { success: false, error: 'Stored friend metadata is invalid JSON; fix in DB before merge' },
        422,
      );
    }
    const mergedResult = mergeFriendMetadataPatch(existing, body);
    if (!mergedResult.ok) {
      return c.json({ success: false, error: mergedResult.error }, mergedResult.status);
    }
    const merged = mergedResult.merged;
    const now = jstNow();

    await db
      .prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(merged), now, friendId)
      .run();

    const updated = await getFriendById(db, friendId);
    const tags = await getFriendTags(db, friendId);

    return c.json({
      success: true,
      data: {
        ...serializeFriend(updated!),
        tags: tags.map(serializeTag),
      },
    });
  } catch (err) {
    console.error('PUT /api/friends/:id/metadata error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/friends/:id/messages - get message history
friends.get('/api/friends/:id/messages', async (c) => {
  try {
    const friendId = c.req.param('id');
    const friend = await getFriendById(c.env.DB, friendId);
    const scopeDenied = await jsonIfFriendOutOfScope(c, friend);
    if (scopeDenied) {
      return scopeDenied;
    }

    const msgLimit = clampListLimit(c.req.query('limit'), 200, 500);
    const msgOffset = clampOffset(c.req.query('offset'), 500_000);
    const result = await c.env.DB.prepare(
      `SELECT id, direction, message_type as messageType, content, created_at as createdAt
         FROM messages_log WHERE friend_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?`,
    )
      .bind(friendId, msgLimit, msgOffset)
      .all<{
        id: string;
        direction: string;
        messageType: string;
        content: string;
        createdAt: string;
      }>();
    return c.json({ success: true, data: result.results });
  } catch (err) {
    console.error('GET /api/friends/:id/messages error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/friends/:id/messages - send message to friend
friends.post('/api/friends/:id/messages', async (c) => {
  try {
    const friendId = c.req.param('id');
    const body = await readJsonBodyWithLimit<{
      messageType?: string;
      content: string;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);

    if (!body.content) {
      return c.json({ success: false, error: 'content is required' }, 400);
    }

    const db = c.env.DB;
    const friend = await getFriendById(db, friendId);
    const scopeDeniedMsg = await jsonIfFriendOutOfScope(c, friend);
    if (scopeDeniedMsg) {
      return scopeDeniedMsg;
    }

    const friendRow = friend!;
    const { LineClient } = await import('@line-crm/line-sdk');
    const accessToken = await resolveLineAccessTokenForFriend(
      db,
      c.env.LINE_CHANNEL_ACCESS_TOKEN,
      friendId,
    );
    const lineClient = new LineClient(accessToken);
    const messageType = body.messageType ?? 'text';

    const message = buildMessage(messageType, body.content);
    await lineClient.pushMessage(friendRow.line_user_id, [message]);

    // Log outgoing message
    const logId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
         VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, ?)`,
      )
      .bind(logId, friendRow.id, messageType, body.content, jstNow())
      .run();

    return c.json({ success: true, data: { messageId: logId } });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/friends/:id/messages error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { friends };
