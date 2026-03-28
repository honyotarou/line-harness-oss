import { jstNow } from './utils.js';
export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface FriendTag {
  friend_id: string;
  tag_id: string;
  assigned_at: string;
}

export async function getTags(db: D1Database): Promise<Tag[]> {
  const result = await db.prepare(`SELECT * FROM tags ORDER BY name ASC`).all<Tag>();
  return result.results;
}

export interface CreateTagInput {
  name: string;
  color?: string;
}

export async function createTag(db: D1Database, input: CreateTagInput): Promise<Tag> {
  const id = crypto.randomUUID();
  const now = jstNow();
  const color = input.color ?? '#3B82F6';

  await db
    .prepare(
      `INSERT INTO tags (id, name, color, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(id, input.name, color, now)
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
      created_at: row.created_at,
    });
  }

  return result;
}

import type { Friend } from './friends';

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
