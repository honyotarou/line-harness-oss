export type InboxThreadRow = Readonly<{
  friend_id: string;
  display_name: string | null;
  picture_url: string | null;
  line_user_id: string | null;
  line_account_id: string | null;
  last_content: string | null;
  last_direction: string | null;
  last_at: string | null;
  incoming_total: number;
}>;

/** Friends with message history, newest activity first (operator inbox / 1画面目). */
export async function listInboxThreads(
  db: D1Database,
  opts: Readonly<{ lineAccountId?: string | null; limit: number; offset: number }>,
): Promise<InboxThreadRow[]> {
  const { limit, offset } = opts;
  const acc = opts.lineAccountId?.trim();

  const baseFrom = `
    FROM friends f
    INNER JOIN messages_log ml ON ml.friend_id = f.id
  `;

  if (acc) {
    const sql = `
      SELECT
        f.id AS friend_id,
        f.display_name,
        f.picture_url,
        f.line_user_id,
        f.line_account_id,
        (SELECT content FROM messages_log WHERE friend_id = f.id ORDER BY created_at DESC LIMIT 1) AS last_content,
        (SELECT direction FROM messages_log WHERE friend_id = f.id ORDER BY created_at DESC LIMIT 1) AS last_direction,
        (SELECT created_at FROM messages_log WHERE friend_id = f.id ORDER BY created_at DESC LIMIT 1) AS last_at,
        (SELECT COUNT(*) FROM messages_log WHERE friend_id = f.id AND direction = 'incoming') AS incoming_total
      ${baseFrom}
      WHERE f.line_account_id = ?
      GROUP BY f.id
      ORDER BY last_at DESC
      LIMIT ? OFFSET ?
    `;
    const r = await db.prepare(sql).bind(acc, limit, offset).all<InboxThreadRow>();
    return r.results;
  }

  const sql = `
    SELECT
      f.id AS friend_id,
      f.display_name,
      f.picture_url,
      f.line_user_id,
      f.line_account_id,
      (SELECT content FROM messages_log WHERE friend_id = f.id ORDER BY created_at DESC LIMIT 1) AS last_content,
      (SELECT direction FROM messages_log WHERE friend_id = f.id ORDER BY created_at DESC LIMIT 1) AS last_direction,
      (SELECT created_at FROM messages_log WHERE friend_id = f.id ORDER BY created_at DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM messages_log WHERE friend_id = f.id AND direction = 'incoming') AS incoming_total
    ${baseFrom}
    GROUP BY f.id
    ORDER BY last_at DESC
    LIMIT ? OFFSET ?
  `;
  const r = await db.prepare(sql).bind(limit, offset).all<InboxThreadRow>();
  return r.results;
}
