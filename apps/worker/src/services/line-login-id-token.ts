import { getLineAccounts } from '@line-crm/db';

/**
 * Verify a LINE Login ID token against the default channel and any login_channel_id on line_accounts.
 */
export async function verifyLineLoginIdToken(
  db: D1Database,
  defaultLoginChannelId: string,
  rawIdToken: string,
): Promise<{ sub: string; email?: string; name?: string } | null> {
  const loginChannelIds = [defaultLoginChannelId];
  const dbAccounts = await getLineAccounts(db);
  for (const acct of dbAccounts) {
    if (acct.login_channel_id && !loginChannelIds.includes(acct.login_channel_id)) {
      loginChannelIds.push(acct.login_channel_id);
    }
  }

  let verifyRes: Response | null = null;
  for (const channelId of loginChannelIds) {
    verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: rawIdToken, client_id: channelId }),
    });
    if (verifyRes.ok) break;
  }

  if (!verifyRes?.ok) return null;
  return verifyRes.json() as Promise<{ sub: string; email?: string; name?: string }>;
}
