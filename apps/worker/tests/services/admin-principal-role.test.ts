import { describe, expect, it, vi } from 'vitest';
import { getAdminPrincipalRole, resolveAdminPrincipalAccess } from '@line-crm/db';

describe('resolveAdminPrincipalAccess', () => {
  it('matches legacy getAdminPrincipalRole when strictAllowlist is false', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return { first: vi.fn().mockResolvedValue(null) };
          },
        };
      },
    } as unknown as D1Database;

    const r = await resolveAdminPrincipalAccess(db, 'any@example.com', { strictAllowlist: false });
    expect(r).toEqual({ kind: 'allow', role: 'admin' });
  });

  it('returns bootstrap_empty_table when strict and COUNT is 0', async () => {
    const db = {
      prepare(sql: string) {
        const api = {
          bind() {
            return api;
          },
          first: async () => {
            if (sql.includes('COUNT(*)')) return { c: 0 };
            return null;
          },
        };
        return api;
      },
    } as unknown as D1Database;

    const r = await resolveAdminPrincipalAccess(db, 'x@example.com', { strictAllowlist: true });
    expect(r).toEqual({ kind: 'bootstrap_empty_table' });
  });

  it('returns deny_unlisted when strict, table non-empty, and no row', async () => {
    const db = {
      prepare(sql: string) {
        const api = {
          bind() {
            return api;
          },
          first: async () => {
            if (sql.includes('COUNT(*)')) return { c: 2 };
            return null;
          },
        };
        return api;
      },
    } as unknown as D1Database;

    const r = await resolveAdminPrincipalAccess(db, 'missing@example.com', {
      strictAllowlist: true,
    });
    expect(r).toEqual({ kind: 'deny_unlisted' });
  });
});

describe('getAdminPrincipalRole', () => {
  it('returns admin when no row exists', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return { first: vi.fn().mockResolvedValue(null) };
          },
        };
      },
    } as unknown as D1Database;

    expect(await getAdminPrincipalRole(db, 'any@example.com')).toBe('admin');
  });

  it('returns viewer when row says viewer', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return { first: vi.fn().mockResolvedValue({ role: 'viewer' }) };
          },
        };
      },
    } as unknown as D1Database;

    expect(await getAdminPrincipalRole(db, 'V@Example.COM')).toBe('viewer');
  });

  it('treats unknown role string as admin', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return { first: vi.fn().mockResolvedValue({ role: 'superuser' }) };
          },
        };
      },
    } as unknown as D1Database;

    expect(await getAdminPrincipalRole(db, 'x@example.com')).toBe('admin');
  });
});
