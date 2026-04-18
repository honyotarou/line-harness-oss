import { describe, expect, it } from 'vitest';
import { isD1NoSuchTableError } from '@line-crm/db';

describe('isD1NoSuchTableError', () => {
  it('matches typical D1/SQLite missing-table messages', () => {
    expect(
      isD1NoSuchTableError(
        new Error('D1_ERROR: no such table: admin_principal_line_accounts: SQLITE_ERROR'),
        'admin_principal_line_accounts',
      ),
    ).toBe(true);
    expect(
      isD1NoSuchTableError(
        new Error('no such table: admin_principal_line_accounts'),
        'admin_principal_line_accounts',
      ),
    ).toBe(true);
  });

  it('returns false for unrelated errors or other tables', () => {
    expect(
      isD1NoSuchTableError(new Error('constraint failed'), 'admin_principal_line_accounts'),
    ).toBe(false);
    expect(
      isD1NoSuchTableError(
        new Error('no such table: other_table'),
        'admin_principal_line_accounts',
      ),
    ).toBe(false);
  });
});
