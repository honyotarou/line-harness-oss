import type { LineAccountDbOptions } from '@line-crm/db';
import { getFriendById, getLineAccountById } from '@line-crm/db';

export async function resolveLineAccessTokenForLineAccountId(
  db: D1Database,
  defaultAccessToken: string,
  lineAccountId?: string | null,
  lineAccountOpts?: LineAccountDbOptions,
): Promise<string> {
  if (!lineAccountId) {
    return defaultAccessToken;
  }

  const account = await getLineAccountById(db, lineAccountId, lineAccountOpts);
  return account?.channel_access_token ?? defaultAccessToken;
}

export async function resolveLineAccessTokenForFriend(
  db: D1Database,
  defaultAccessToken: string,
  friendId: string,
  lineAccountOpts?: LineAccountDbOptions,
): Promise<string> {
  const friend = await getFriendById(db, friendId);
  return resolveLineAccessTokenForLineAccountId(
    db,
    defaultAccessToken,
    friend?.line_account_id ?? null,
    lineAccountOpts,
  );
}
