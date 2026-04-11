function normalizePrincipalEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * LINE account IDs this Cloudflare Access principal may use in admin APIs.
 * Empty array means no restriction (legacy: all accounts).
 */
export async function listPrincipalLineAccountIdsForEmail(
  db: D1Database,
  email: string,
): Promise<string[]> {
  const normalized = normalizePrincipalEmail(email);
  if (!normalized) {
    return [];
  }
  const res = await db
    .prepare(
      `SELECT line_account_id AS id FROM admin_principal_line_accounts WHERE email = ? COLLATE NOCASE`,
    )
    .bind(normalized)
    .all<{ id: string }>();
  const rows = res.results ?? [];
  return rows.map((r) => r.id).filter((id): id is string => Boolean(id));
}
