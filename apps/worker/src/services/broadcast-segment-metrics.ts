import { buildSegmentQuery } from './segment-query.js';
import type { SegmentCondition } from './segment-query.js';

/**
 * Count friends matching a segment definition, optionally restricted to a LINE account scope.
 */
export async function countSegmentRecipients(
  db: D1Database,
  condition: SegmentCondition,
  lineAccountId: string | null,
): Promise<number> {
  const { sql, bindings } = buildSegmentQuery(condition);
  if (lineAccountId) {
    const wrapped = `SELECT COUNT(*) AS cnt FROM (${sql}) s INNER JOIN friends f ON f.id = s.id AND f.line_account_id = ?`;
    const row = await db
      .prepare(wrapped)
      .bind(...bindings, lineAccountId)
      .first<{ cnt: number }>();
    return Number(row?.cnt ?? 0);
  }
  const wrapped = `SELECT COUNT(*) AS cnt FROM (${sql}) s`;
  const row = await db
    .prepare(wrapped)
    .bind(...bindings)
    .first<{ cnt: number }>();
  return Number(row?.cnt ?? 0);
}
