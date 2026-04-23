import type { Friend, LineAccountDbOptions } from '@line-crm/db';
import { getLineAccountById, getLineAccounts } from '@line-crm/db';
import { collectLineLoginChannelIds, verifyLineIdToken } from './line-id-token.js';

/**
 * Verify a LINE Login ID token against the default channel and any login_channel_id on line_accounts.
 */
export const MAX_LINE_LOGIN_CHANNEL_IDS = 10;

export type VerifiedLineLoginIdToken = Readonly<{
  sub: string;
  email?: string;
  name?: string;
  loginChannelId: string;
}>;

export async function verifyLineLoginIdToken(
  db: D1Database,
  defaultLoginChannelId: string,
  rawIdToken: string,
  lineAccountOpts?: LineAccountDbOptions,
): Promise<VerifiedLineLoginIdToken | null> {
  const dbAccounts = await getLineAccounts(db, lineAccountOpts);
  const loginChannelIds = collectLineLoginChannelIds(defaultLoginChannelId, dbAccounts).slice(
    0,
    MAX_LINE_LOGIN_CHANNEL_IDS,
  );

  const verified = await verifyLineIdToken(rawIdToken, loginChannelIds);
  if (!verified) return null;
  return {
    sub: verified.sub,
    email: verified.email,
    name: verified.name,
    loginChannelId: verified.loginChannelId,
  };
}

/** When the friend is scoped to a line_account, the token must have been verified for that account's login channel. */
export async function lineLoginChannelMatchesFriendLineAccount(
  db: D1Database,
  verifiedLoginChannelId: string,
  friend: Pick<Friend, 'line_account_id'>,
  lineAccountOpts?: LineAccountDbOptions,
): Promise<boolean> {
  if (!friend.line_account_id) return true;
  const account = await getLineAccountById(db, friend.line_account_id, lineAccountOpts);
  const expected = account?.login_channel_id?.trim();
  if (!expected) return false;
  return expected === verifiedLoginChannelId;
}
