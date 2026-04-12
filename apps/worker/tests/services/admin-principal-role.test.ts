import { describe, expect, it, vi } from 'vitest';
import {
  getAdminPrincipalRole,
  getExplicitAdminPrincipalRole,
  resolveAdminPrincipalAccess,
} from '@line-crm/db';

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

  it('returns owner when row says owner', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return { first: vi.fn().mockResolvedValue({ role: 'owner' }) };
          },
        };
      },
    } as unknown as D1Database;

    expect(await getAdminPrincipalRole(db, 'o@example.com')).toBe('owner');
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

  it('returns null from getExplicitAdminPrincipalRole when no row', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return { first: vi.fn().mockResolvedValue(null) };
          },
        };
      },
    } as unknown as D1Database;

    expect(await getExplicitAdminPrincipalRole(db, 'ghost@example.com')).toBeNull();
  });

  it('returns admin from getExplicitAdminPrincipalRole when row says admin', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return { first: vi.fn().mockResolvedValue({ role: 'admin' }) };
          },
        };
      },
    } as unknown as D1Database;

    expect(await getExplicitAdminPrincipalRole(db, 'a@example.com')).toBe('admin');
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
