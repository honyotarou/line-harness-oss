import { describe, expect, it } from 'vitest';
import { friendScopeGuardCheck } from '../../src/services/friend-scope-guard.js';
import type { LineAccountScope } from '../../src/services/admin-line-account-scope.js';

const allScope: LineAccountScope = { mode: 'all' };
const restrictedAScope: LineAccountScope = { mode: 'restricted', ids: new Set(['acc-A']) };

describe('friendScopeGuardCheck (pure, shared scope guard for friend-addressed routes)', () => {
  it('returns 404 when the friend does not exist', () => {
    const result = friendScopeGuardCheck(allScope, null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.body).toEqual({ success: false, error: 'Friend not found' });
    }
  });

  it('accepts any friend under scope.mode="all"', () => {
    expect(friendScopeGuardCheck(allScope, { line_account_id: 'acc-A' }).ok).toBe(true);
    expect(friendScopeGuardCheck(allScope, { line_account_id: 'acc-Z' }).ok).toBe(true);
    expect(friendScopeGuardCheck(allScope, { line_account_id: null }).ok).toBe(true);
  });

  it('accepts a friend whose tenant is in the restricted set', () => {
    expect(friendScopeGuardCheck(restrictedAScope, { line_account_id: 'acc-A' }).ok).toBe(true);
  });

  it('returns 404 (no existence oracle) when the friend tenant is out of scope', () => {
    const result = friendScopeGuardCheck(restrictedAScope, { line_account_id: 'acc-B' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      // Use 404 rather than 403 so the response does not leak whether the friend exists
      expect(result.body).toEqual({ success: false, error: 'Friend not found' });
    }
  });

  it('returns 404 when the friend is a global (null) row but the scope is restricted', () => {
    const result = friendScopeGuardCheck(restrictedAScope, { line_account_id: null });
    expect(result.ok).toBe(false);
  });
});
