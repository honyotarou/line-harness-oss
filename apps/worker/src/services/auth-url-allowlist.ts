import { getLineAccountById } from '@line-crm/db';

/**
 * LINE Login `account` query must only point at the friend’s own bot (or the default channel).
 * Used to restrict `{{auth_url:CHANNEL_ID}}` expansion in outbound copy.
 */
export async function buildAuthUrlChannelAllowlist(
  db: D1Database,
  friend: { line_account_id?: string | null },
  fallbackChannelId: string,
): Promise<Set<string>> {
  if (friend.line_account_id) {
    const acc = await getLineAccountById(db, friend.line_account_id);
    const cid = acc?.channel_id?.trim();
    if (cid) {
      return new Set([cid]);
    }
  }
  const d = fallbackChannelId?.trim();
  if (d) {
    return new Set([d]);
  }
  return new Set();
}
