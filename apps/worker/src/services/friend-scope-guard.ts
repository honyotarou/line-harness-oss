import {
  resourceLineAccountVisibleInScope,
  type LineAccountScope,
} from './admin-line-account-scope.js';

export type FriendLike = Readonly<{ line_account_id: string | null }>;

export type FriendScopeGuardResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      status: 404;
      body: Readonly<{ success: false; error: string }>;
    }>;

const NOT_FOUND: FriendScopeGuardResult = {
  ok: false,
  status: 404,
  body: { success: false, error: 'Friend not found' },
} as const;

/**
 * Pure scope gate for friend-addressed admin/internal routes.
 *
 * Returns 404 (not 403) for both "does not exist" and "out of scope", so the
 * response does not act as an existence oracle across tenants.
 *
 * Why extracted: F4 (users/:id/link) and F5a (friends/:id/score) share the
 * same gate already used by friends.ts. Inlining it everywhere makes it easy
 * to forget — one function, one fail-closed rule.
 */
export function friendScopeGuardCheck(
  scope: LineAccountScope,
  friend: FriendLike | null,
): FriendScopeGuardResult {
  if (!friend) {
    return NOT_FOUND;
  }
  if (!resourceLineAccountVisibleInScope(scope, friend.line_account_id)) {
    return NOT_FOUND;
  }
  return { ok: true };
}
