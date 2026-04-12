import { describe, expect, it, vi } from 'vitest';
import { createUser, normalizeUserEmailForStorage } from '@line-crm/db';

describe('normalizeUserEmailForStorage (V-7 case-variant email)', () => {
  it('lowercases and trims LINE Login style emails', () => {
    expect(normalizeUserEmailForStorage('  Victim@Example.COM  ')).toBe('victim@example.com');
  });

  it('returns null for empty or whitespace-only', () => {
    expect(normalizeUserEmailForStorage('')).toBe(null);
    expect(normalizeUserEmailForStorage('   ')).toBe(null);
    expect(normalizeUserEmailForStorage(null)).toBe(null);
    expect(normalizeUserEmailForStorage(undefined)).toBe(null);
  });
});

describe('createUser email storage', () => {
  it('inserts canonical lowercase email so UNIQUE cannot admit case duplicates', async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const first = vi.fn().mockReturnValue({ run });
    const bind = vi.fn().mockReturnValue({ first, run });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    await createUser(db, { email: 'User@EXAMPLE.com', displayName: 'x' });

    expect(bind).toHaveBeenCalled();
    const insertArgs = bind.mock.calls[0] as unknown[];
    // INSERT ... VALUES (id, email, phone, ...) — email is 2nd placeholder value
    expect(insertArgs[1]).toBe('user@example.com');
  });
});
