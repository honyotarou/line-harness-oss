import { describe, expect, it } from 'vitest';
import { tenantScopedRuleMatches } from '../../src/services/tenant-scoped-rule-filter.js';

describe('tenantScopedRuleMatches (fail-closed tenant filter for event-bus rules)', () => {
  it('allows a global rule (line_account_id=null) to fire in any tenant context', () => {
    expect(tenantScopedRuleMatches({ line_account_id: null }, 'acc-A')).toBe(true);
    expect(tenantScopedRuleMatches({ line_account_id: null }, null)).toBe(true);
  });

  it('allows a global rule to fire when caller has no tenant context (undefined)', () => {
    expect(tenantScopedRuleMatches({ line_account_id: null }, undefined)).toBe(true);
  });

  it('allows a scoped rule to fire only when the tenant matches exactly', () => {
    expect(tenantScopedRuleMatches({ line_account_id: 'acc-A' }, 'acc-A')).toBe(true);
  });

  it('rejects a scoped rule when the tenant differs', () => {
    expect(tenantScopedRuleMatches({ line_account_id: 'acc-A' }, 'acc-B')).toBe(false);
  });

  it('FAIL-CLOSED: rejects a scoped rule when caller passes undefined (no tenant context)', () => {
    // Why this test exists: F1 in the pentest. The previous `!a.line_account_id || !lineAccountId || ...`
    // filter short-circuited to true when callers forgot to pass lineAccountId,
    // letting tenant B's scoped automations fire on tenant A's incoming webhook.
    expect(tenantScopedRuleMatches({ line_account_id: 'acc-A' }, undefined)).toBe(false);
  });

  it('FAIL-CLOSED: rejects a scoped rule when caller passes null (explicit "no tenant")', () => {
    expect(tenantScopedRuleMatches({ line_account_id: 'acc-A' }, null)).toBe(false);
  });
});
