import { getFriendById, getLineAccountById } from '@line-crm/db';

export async function resolveLineAccessTokenForLineAccountId(
  db: D1Database,
  defaultAccessToken: string,
  lineAccountId?: string | null,
): Promise<string> {
  if (!lineAccountId) {
    return defaultAccessToken;
  }

  const account = await getLineAccountById(db, lineAccountId);
  return account?.channel_access_token ?? defaultAccessToken;
}

export async function resolveLineAccessTokenForFriend(
  db: D1Database,
  defaultAccessToken: string,
  friendId: string,
): Promise<string> {
  const friend = await getFriendById(db, friendId);
  return resolveLineAccessTokenForLineAccountId(
    db,
    defaultAccessToken,
    friend?.line_account_id ?? null,
  );
}
