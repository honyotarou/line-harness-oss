import type { Friend, LineAccountDbOptions } from '@line-crm/db';
import { listFriendsByLineUserId } from '@line-crm/db';
import type { VerifiedLineIdToken } from '../services/line-id-token.js';
import { lineLoginChannelMatchesFriendLineAccount } from '../services/line-login-id-token.js';

export type FormSubmitFriendResolution =
  | Readonly<{ ok: true; friend: Friend }>
  | Readonly<{ ok: false; reason: 'none' | 'ambiguous' }>;

export async function resolveFormSubmitFriendFromVerifiedToken(
  db: D1Database,
  verified: VerifiedLineIdToken,
  lineOpts: LineAccountDbOptions | undefined,
): Promise<FormSubmitFriendResolution> {
  const candidates = await listFriendsByLineUserId(db, verified.sub);
  const matched: Friend[] = [];
  for (const f of candidates) {
    if (await lineLoginChannelMatchesFriendLineAccount(db, verified.loginChannelId, f, lineOpts)) {
      matched.push(f);
    }
  }
  if (matched.length === 0) return { ok: false, reason: 'none' };
  if (matched.length > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: true, friend: matched[0]! };
}
