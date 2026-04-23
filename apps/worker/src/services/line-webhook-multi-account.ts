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
 *
 * With **more than one active LINE account**, never falls back to `LINE_CHANNEL_SECRET` when the
 * request cannot be tied to a matching DB account (missing `destination`, or signature does not
 * match any stored secret).
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
  const accounts = await getLineAccounts(input.db, lineAccountDbOptions(input.env));
  const activeAccounts = accounts.filter((a) => a.is_active);
  const activeCount = activeAccounts.length;

  const envCreds: ResolvedLineWebhookCredentials = {
    channelSecret: input.env.LINE_CHANNEL_SECRET,
    channelAccessToken: input.env.LINE_CHANNEL_ACCESS_TOKEN,
    matchedAccountId: null,
  };

  if (!input.destination?.trim()) {
    if (activeCount > 1) {
      return { channelSecret: '', channelAccessToken: '', matchedAccountId: null };
    }
    return envCreds;
  }

  let matched: { id: string; channel_secret: string; channel_access_token: string } | null = null;
  for (const account of activeAccounts) {
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
    return {
      channelSecret: matched.channel_secret,
      channelAccessToken: matched.channel_access_token,
      matchedAccountId: matched.id,
    };
  }

  if (activeCount > 1) {
    return { channelSecret: '', channelAccessToken: '', matchedAccountId: null };
  }

  return envCreds;
}
