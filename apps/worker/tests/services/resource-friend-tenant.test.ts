import { describe, expect, it } from 'vitest';
import { resourceBelongsToFriendTenant } from '../../src/services/resource-friend-tenant.js';

describe('resourceBelongsToFriendTenant', () => {
  it('accepts scoped resource whose line_account_id matches the friend', () => {
    expect(
      resourceBelongsToFriendTenant(
        { line_account_id: 'acc-A' },
        { line_account_id: 'acc-A' },
        { multi: true },
      ),
    ).toBe(true);
  });

  it('rejects scoped resource whose line_account_id differs from the friend', () => {
    expect(
      resourceBelongsToFriendTenant(
        { line_account_id: 'acc-B' },
        { line_account_id: 'acc-A' },
        { multi: true },
      ),
    ).toBe(false);
  });

  it('rejects scoped resource when the friend is global (line_account_id=null)', () => {
    expect(
      resourceBelongsToFriendTenant(
        { line_account_id: 'acc-A' },
        { line_account_id: null },
        { multi: true },
      ),
    ).toBe(false);
  });

  it('accepts global resource in single-tenant mode regardless of the friend tenant', () => {
    expect(
      resourceBelongsToFriendTenant(
        { line_account_id: null },
        { line_account_id: 'acc-A' },
        { multi: false },
      ),
    ).toBe(true);
    expect(
      resourceBelongsToFriendTenant(
        { line_account_id: null },
        { line_account_id: null },
        { multi: false },
      ),
    ).toBe(true);
  });

  it('rejects global resource in multi-tenant mode when the friend has a specific tenant', () => {
    expect(
      resourceBelongsToFriendTenant(
        { line_account_id: null },
        { line_account_id: 'acc-A' },
        { multi: true },
      ),
    ).toBe(false);
  });

  it('accepts global resource in multi-tenant mode when the friend is also global', () => {
    expect(
      resourceBelongsToFriendTenant(
        { line_account_id: null },
        { line_account_id: null },
        { multi: true },
      ),
    ).toBe(true);
  });
});
