import { describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  countAdminPrincipalRoles: vi.fn(),
  insertBootstrapAdminPrincipalRoleIfEmpty: vi.fn(),
  upsertAdminPrincipalRole: vi.fn(),
}));

vi.mock('@line-crm/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@line-crm/db')>();
  return {
    ...actual,
    countAdminPrincipalRoles: dbMocks.countAdminPrincipalRoles,
    insertBootstrapAdminPrincipalRoleIfEmpty: dbMocks.insertBootstrapAdminPrincipalRoleIfEmpty,
    upsertAdminPrincipalRole: dbMocks.upsertAdminPrincipalRole,
  };
});

describe('putAdminPrincipalRoleWithBootstrap', () => {
  it('upserts when allowlist flag is off', async () => {
    dbMocks.countAdminPrincipalRoles.mockReset();
    dbMocks.insertBootstrapAdminPrincipalRoleIfEmpty.mockReset();
    dbMocks.upsertAdminPrincipalRole.mockReset();

    const { putAdminPrincipalRoleWithBootstrap } = await import(
      '../../src/services/admin-principal-roles-write.js'
    );
    const db = {} as D1Database;
    const r = await putAdminPrincipalRoleWithBootstrap(db, {}, 'a@x.com', 'admin');
    expect(r).toEqual({ ok: true });
    expect(dbMocks.countAdminPrincipalRoles).not.toHaveBeenCalled();
    expect(dbMocks.upsertAdminPrincipalRole).toHaveBeenCalledWith(db, 'a@x.com', 'admin');
  });

  it('uses bootstrap insert when allowlist on and table empty', async () => {
    dbMocks.countAdminPrincipalRoles.mockResolvedValue(0);
    dbMocks.insertBootstrapAdminPrincipalRoleIfEmpty.mockResolvedValue({ inserted: true });
    dbMocks.upsertAdminPrincipalRole.mockReset();

    const { putAdminPrincipalRoleWithBootstrap } = await import(
      '../../src/services/admin-principal-roles-write.js'
    );
    const db = {} as D1Database;
    const r = await putAdminPrincipalRoleWithBootstrap(
      db,
      { REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST: '1' },
      'owner@x.com',
      'owner',
    );
    expect(r).toEqual({ ok: true });
    expect(dbMocks.insertBootstrapAdminPrincipalRoleIfEmpty).toHaveBeenCalled();
    expect(dbMocks.upsertAdminPrincipalRole).not.toHaveBeenCalled();
  });

  it('returns 409 when bootstrap loses race', async () => {
    dbMocks.countAdminPrincipalRoles.mockResolvedValue(0);
    dbMocks.insertBootstrapAdminPrincipalRoleIfEmpty.mockResolvedValue({ inserted: false });

    const { putAdminPrincipalRoleWithBootstrap } = await import(
      '../../src/services/admin-principal-roles-write.js'
    );
    const db = {} as D1Database;
    const r = await putAdminPrincipalRoleWithBootstrap(
      db,
      { REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST: 'true' },
      'late@x.com',
      'owner',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.error).toMatch(/Bootstrap race/i);
    }
  });

  it('upserts when allowlist on but table already has rows', async () => {
    dbMocks.countAdminPrincipalRoles.mockResolvedValue(1);
    dbMocks.insertBootstrapAdminPrincipalRoleIfEmpty.mockReset();
    dbMocks.upsertAdminPrincipalRole.mockReset();

    const { putAdminPrincipalRoleWithBootstrap } = await import(
      '../../src/services/admin-principal-roles-write.js'
    );
    const db = {} as D1Database;
    await putAdminPrincipalRoleWithBootstrap(
      db,
      { REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST: '1' },
      'second@x.com',
      'admin',
    );
    expect(dbMocks.insertBootstrapAdminPrincipalRoleIfEmpty).not.toHaveBeenCalled();
    expect(dbMocks.upsertAdminPrincipalRole).toHaveBeenCalledWith(db, 'second@x.com', 'admin');
  });
});
