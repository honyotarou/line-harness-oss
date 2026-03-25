export interface LineAccountStats {
  friendCount: number;
  activeScenarios: number;
  messagesThisMonth: number;
}

interface AggregateRow {
  lineAccountId: string | null;
  count: number;
}

const EMPTY_STATS: LineAccountStats = {
  friendCount: 0,
  activeScenarios: 0,
  messagesThisMonth: 0,
};

async function loadAggregateCounts(
  db: D1Database,
  sql: string,
): Promise<Record<string, number>> {
  const result = await db.prepare(sql).all<AggregateRow>();
  const rows = result.results ?? [];
  return Object.fromEntries(
    rows
      .filter((row) => Boolean(row.lineAccountId))
      .map((row) => [row.lineAccountId as string, row.count]),
  );
}

export async function loadLineAccountStats(
  db: D1Database,
): Promise<Record<string, LineAccountStats>> {
  const [friendCounts, activeScenarioCounts, messageCounts] = await Promise.all([
    loadAggregateCounts(
      db,
      `SELECT line_account_id AS lineAccountId, COUNT(*) AS count
       FROM friends
       WHERE is_following = 1 AND line_account_id IS NOT NULL
       GROUP BY line_account_id`,
    ),
    loadAggregateCounts(
      db,
      `SELECT f.line_account_id AS lineAccountId, COUNT(*) AS count
       FROM friend_scenarios fs
       INNER JOIN friends f ON f.id = fs.friend_id
       WHERE fs.status = 'active' AND f.line_account_id IS NOT NULL
       GROUP BY f.line_account_id`,
    ),
    loadAggregateCounts(
      db,
      `SELECT f.line_account_id AS lineAccountId, COUNT(*) AS count
       FROM messages_log ml
       INNER JOIN friends f ON f.id = ml.friend_id
       WHERE ml.direction = 'outgoing'
         AND ml.created_at >= date('now', '-30 days')
         AND f.line_account_id IS NOT NULL
       GROUP BY f.line_account_id`,
    ),
  ]);

  const accountIds = new Set([
    ...Object.keys(friendCounts),
    ...Object.keys(activeScenarioCounts),
    ...Object.keys(messageCounts),
  ]);

  return Object.fromEntries(
    Array.from(accountIds).map((accountId) => [
      accountId,
      {
        ...EMPTY_STATS,
        friendCount: friendCounts[accountId] ?? 0,
        activeScenarios: activeScenarioCounts[accountId] ?? 0,
        messagesThisMonth: messageCounts[accountId] ?? 0,
      },
    ]),
  );
}
