import {
  countAdminPrincipalRoles,
  insertBootstrapAdminPrincipalRoleIfEmpty,
  upsertAdminPrincipalRole,
  type AdminPrincipalRole,
} from '@line-crm/db';

export function isRequireAdminPrincipalAllowlist(env: {
  REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST?: string;
}): boolean {
  const v = env.REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export type PutPrincipalRoleResult =
  | { ok: true }
  | {
      ok: false;
      status: 409;
      error: string;
    };

/**
 * PUT /api/admin/principal-roles body handler: atomic first row when allowlist is strict and table empty.
 */
export async function putAdminPrincipalRoleWithBootstrap(
  db: D1Database,
  env: { REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST?: string },
  email: string,
  role: AdminPrincipalRole,
): Promise<PutPrincipalRoleResult> {
  if (isRequireAdminPrincipalAllowlist(env)) {
    const n = await countAdminPrincipalRoles(db);
    if (n === 0) {
      const { inserted } = await insertBootstrapAdminPrincipalRoleIfEmpty(db, email, role);
      if (!inserted) {
        return {
          ok: false,
          status: 409,
          error:
            'Bootstrap race: another request added the first principal. Retry PUT or refresh the principal list.',
        };
      }
      return { ok: true };
    }
  }
  await upsertAdminPrincipalRole(db, email, role);
  return { ok: true };
}
