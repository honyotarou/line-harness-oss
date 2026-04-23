import { jstNow } from './utils.js';
import type { Friend } from './friends.js';

export type Tag = Readonly<{
  id: string;
  name: string;
  color: string;
  line_account_id: string | null;
  created_at: string;
}>;

export type FriendTag = Readonly<{
  friend_id: string;
  tag_id: string;
  assigned_at: string;
}>;

export type GetTagsOptions = Readonly<{
  /**
   * When set, return only tags whose `line_account_id` is in this list (non-null rows only).
   * Empty array returns no rows. Omit for unrestricted full listing.
   */
  lineAccountIds?: readonly string[];
}>;

export async function getTags(db: D1Database, opts: GetTagsOptions = {}): Promise<Tag[]> {
  const ids = opts.lineAccountIds;
  if (ids !== undefined) {
    if (ids.length === 0) {
      return [];
    }
    const ph = ids.map(() => '?').join(',');
    const result = await db
      .prepare(
        `SELECT * FROM tags WHERE line_account_id IS NOT NULL AND line_account_id IN (${ph}) ORDER BY name ASC`,
      )
      .bind(...ids)
      .all<Tag>();
    return result.results;
  }
  const result = await db.prepare(`SELECT * FROM tags ORDER BY name ASC`).all<Tag>();
  return result.results;
}

export async function getTagById(db: D1Database, id: string): Promise<Tag | null> {
  return db.prepare(`SELECT * FROM tags WHERE id = ?`).bind(id).first<Tag>();
}

/**
 * Resolve a purchase / automation tag for a friend without picking another LINE account's
 * identically named row (multi-tenant).
 */
export async function findTagForFriendByName(
  db: D1Database,
  friendId: string,
  name: string,
): Promise<Tag | null> {
  return db
    .prepare(
      `SELECT t.*
       FROM tags t
       INNER JOIN friends f ON f.id = ?
       WHERE t.name = ?
         AND (t.line_account_id IS NULL OR t.line_account_id = f.line_account_id)
       ORDER BY CASE WHEN t.line_account_id IS NOT NULL THEN 0 ELSE 1 END
       LIMIT 1`,
    )
    .bind(friendId, name)
    .first<Tag>();
}

export type CreateTagInput = Readonly<{
  name: string;
  color?: string;
  lineAccountId?: string | null;
}>;

export async function createTag(db: D1Database, input: CreateTagInput): Promise<Tag> {
  const id = crypto.randomUUID();
  const now = jstNow();
  const color = input.color ?? '#3B82F6';
  const lineAccountId = input.lineAccountId?.trim() ? input.lineAccountId.trim() : null;

  await db
    .prepare(
      `INSERT INTO tags (id, name, color, line_account_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, input.name, color, lineAccountId, now)
    .run();

  return (await db.prepare(`SELECT * FROM tags WHERE id = ?`).bind(id).first<Tag>())!;
}

export async function deleteTag(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM tags WHERE id = ?`).bind(id).run();
}

export async function addTagToFriend(
  db: D1Database,
  friendId: string,
  tagId: string,
): Promise<void> {
  const now = jstNow();
  await db
    .prepare(
      `INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at)
       VALUES (?, ?, ?)`,
    )
    .bind(friendId, tagId, now)
    .run();
}

export async function removeTagFromFriend(
  db: D1Database,
  friendId: string,
  tagId: string,
): Promise<void> {
  await db
    .prepare(`DELETE FROM friend_tags WHERE friend_id = ? AND tag_id = ?`)
    .bind(friendId, tagId)
    .run();
}

export async function getFriendTags(db: D1Database, friendId: string): Promise<Tag[]> {
  const result = await db
    .prepare(
      `SELECT t.*
       FROM tags t
       INNER JOIN friend_tags ft ON ft.tag_id = t.id
       WHERE ft.friend_id = ?
       ORDER BY t.name ASC`,
    )
    .bind(friendId)
    .all<Tag>();
  return result.results;
}

/**
 * Batch fetch tags for multiple friends in a single query (avoids N+1).
 * Returns a Map from friendId to Tag[].
 */
export async function getTagsForFriends(
  db: D1Database,
  friendIds: string[],
): Promise<Map<string, Tag[]>> {
  const result = new Map<string, Tag[]>();
  if (friendIds.length === 0) return result;

  const placeholders = friendIds.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT t.*, ft.friend_id
       FROM tags t
       INNER JOIN friend_tags ft ON ft.tag_id = t.id
       WHERE ft.friend_id IN (${placeholders})
       ORDER BY t.name ASC`,
    )
    .bind(...friendIds)
    .all<Tag & { friend_id: string }>();

  for (const row of rows.results) {
    const friendId = row.friend_id;
    if (!result.has(friendId)) {
      result.set(friendId, []);
    }
    result.get(friendId)!.push({
      id: row.id,
      name: row.name,
      color: row.color,
      line_account_id: row.line_account_id,
      created_at: row.created_at,
    });
  }

  return result;
}

export async function getFriendsByTag(db: D1Database, tagId: string): Promise<Friend[]> {
  const result = await db
    .prepare(
      `SELECT f.*
       FROM friends f
       INNER JOIN friend_tags ft ON ft.friend_id = f.id
       WHERE ft.tag_id = ?
       ORDER BY f.created_at DESC`,
    )
    .bind(tagId)
    .all<Friend>();
  return result.results;
}
