export type AdminPrincipalRole = 'admin' | 'viewer';

export type AdminPrincipalRow = {
  email: string;
  role: AdminPrincipalRole;
  updatedAt: string;
};

/** Result of {@link resolveAdminPrincipalAccess} when Cloudflare Access strict allowlist is used. */
export type AdminPrincipalAccessResult =
  | { kind: 'allow'; role: AdminPrincipalRole }
  | { kind: 'deny_unlisted' }
  /** Table has zero rows — only `/api/admin/principal-roles` is reachable until someone adds a row. */
  | { kind: 'bootstrap_empty_table' };

function normalizePrincipalEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function countAdminPrincipalRoles(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS c FROM admin_principal_roles`)
    .first<{ c: number }>();
  const n = Number(row?.c ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * When `strictAllowlist` is false: same as legacy {@link getAdminPrincipalRole} (no row → admin).
 * When true: no row in D1 → deny except while the table is empty (bootstrap to add the first row).
 */
export async function resolveAdminPrincipalAccess(
  db: D1Database,
  email: string,
  options: { strictAllowlist: boolean },
): Promise<AdminPrincipalAccessResult> {
  if (!options.strictAllowlist) {
    const role = await getAdminPrincipalRole(db, email);
    return { kind: 'allow', role };
  }

  const total = await countAdminPrincipalRoles(db);
  if (total === 0) {
    return { kind: 'bootstrap_empty_table' };
  }

  const normalized = normalizePrincipalEmail(email);
  if (!normalized) {
    return { kind: 'deny_unlisted' };
  }

  const row = await db
    .prepare(`SELECT role FROM admin_principal_roles WHERE email = ? COLLATE NOCASE`)
    .bind(normalized)
    .first<{ role: string }>();

  if (!row?.role) {
    return { kind: 'deny_unlisted' };
  }

  const role: AdminPrincipalRole = row.role === 'viewer' ? 'viewer' : 'admin';
  return { kind: 'allow', role };
}

/**
 * Resolve effective admin API role for a Cloudflare Access email.
 * No DB row (or unknown role) → `admin` (backward compatible).
 */
export async function getAdminPrincipalRole(
  db: D1Database,
  email: string,
): Promise<AdminPrincipalRole> {
  const normalized = normalizePrincipalEmail(email);
  if (!normalized) {
    return 'admin';
  }

  const row = await db
    .prepare(`SELECT role FROM admin_principal_roles WHERE email = ? COLLATE NOCASE`)
    .bind(normalized)
    .first<{ role: string }>();

  if (!row?.role) {
    return 'admin';
  }
  return row.role === 'viewer' ? 'viewer' : 'admin';
}

export async function listAdminPrincipalRoles(db: D1Database): Promise<AdminPrincipalRow[]> {
  const res = await db
    .prepare(
      `SELECT email, role, updated_at AS updatedAt FROM admin_principal_roles ORDER BY email COLLATE NOCASE`,
    )
    .all<{ email: string; role: string; updatedAt: string }>();
  const rows = res.results ?? [];
  return rows.map((r) => ({
    email: r.email,
    role: r.role === 'viewer' ? 'viewer' : 'admin',
    updatedAt: r.updatedAt,
  }));
}

export async function upsertAdminPrincipalRole(
  db: D1Database,
  email: string,
  role: AdminPrincipalRole,
): Promise<void> {
  const normalized = normalizePrincipalEmail(email);
  if (!normalized) {
    throw new Error('email is required');
  }
  await db
    .prepare(
      `INSERT INTO admin_principal_roles (email, role, updated_at)
       VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
       ON CONFLICT(email) DO UPDATE SET
         role = excluded.role,
         updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')`,
    )
    .bind(normalized, role)
    .run();
}

/** Returns whether a row was removed. */
export async function deleteAdminPrincipalRole(db: D1Database, email: string): Promise<boolean> {
  const normalized = normalizePrincipalEmail(email);
  if (!normalized) {
    return false;
  }
  const res = await db
    .prepare(`DELETE FROM admin_principal_roles WHERE email = ? COLLATE NOCASE`)
    .bind(normalized)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}
