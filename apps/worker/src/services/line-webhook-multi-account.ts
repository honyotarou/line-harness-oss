import { getLineAccounts } from '@line-crm/db';
import { verifySignature } from '@line-crm/line-sdk';
import { lineAccountDbOptions } from './line-account-at-rest-key.js';

export type ResolvedLineWebhookCredentials = Readonly<{
  channelSecret: string;
  channelAccessToken: string;
  matchedAccountId: string | null;
}>;

/**
 * Multi-account LINE webhook verifier. When `destination` is present, checks all active accounts to
 * resolve which secret matches, without early break to reduce timing leakage about the account list.
 */
export async function resolveLineWebhookCredentials(
  input: Readonly<{
    db: D1Database;
    env: {
      LINE_CHANNEL_SECRET: string;
      LINE_CHANNEL_ACCESS_TOKEN: string;
      LINE_ACCOUNT_SECRETS_KEY?: string;
    };
    destination?: string;
    rawBody: string;
    signature: string;
  }>,
): Promise<ResolvedLineWebhookCredentials> {
  let channelSecret = input.env.LINE_CHANNEL_SECRET;
  let channelAccessToken = input.env.LINE_CHANNEL_ACCESS_TOKEN;
  let matchedAccountId: string | null = null;

  if (!input.destination) {
    return { channelSecret, channelAccessToken, matchedAccountId };
  }

  const accounts = await getLineAccounts(input.db, lineAccountDbOptions(input.env));
  let matched: { id: string; channel_secret: string; channel_access_token: string } | null = null;
  for (const account of accounts) {
    if (!account.is_active) continue;
    const isValid = await verifySignature(account.channel_secret, input.rawBody, input.signature);
    if (isValid && !matched) {
      matched = {
        id: account.id,
        channel_secret: account.channel_secret,
        channel_access_token: account.channel_access_token,
      };
    }
  }

  if (matched) {
    channelSecret = matched.channel_secret;
    channelAccessToken = matched.channel_access_token;
    matchedAccountId = matched.id;
  }

  return { channelSecret, channelAccessToken, matchedAccountId };
}
