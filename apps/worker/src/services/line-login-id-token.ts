import type { LineAccountDbOptions } from '@line-crm/db';
import { getLineAccounts } from '@line-crm/db';
import { collectLineLoginChannelIds, verifyLineIdToken } from './line-id-token.js';

/**
 * Verify a LINE Login ID token against the default channel and any login_channel_id on line_accounts.
 */
export const MAX_LINE_LOGIN_CHANNEL_IDS = 10;

export async function verifyLineLoginIdToken(
  db: D1Database,
  defaultLoginChannelId: string,
  rawIdToken: string,
  lineAccountOpts?: LineAccountDbOptions,
): Promise<{ sub: string; email?: string; name?: string } | null> {
  const dbAccounts = await getLineAccounts(db, lineAccountOpts);
  const loginChannelIds = collectLineLoginChannelIds(defaultLoginChannelId, dbAccounts).slice(
    0,
    MAX_LINE_LOGIN_CHANNEL_IDS,
  );

  const verified = await verifyLineIdToken(rawIdToken, loginChannelIds);
  if (!verified) return null;
  return { sub: verified.sub, email: verified.email, name: verified.name };
}
