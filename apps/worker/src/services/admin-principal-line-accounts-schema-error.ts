export const ADMIN_PRINCIPAL_LINE_ACCOUNTS_SCHEMA_CODE =
  'ADMIN_PRINCIPAL_LINE_ACCOUNTS_SCHEMA' as const;

export type AdminPrincipalLineAccountsSchemaUnavailableError = Error &
  Readonly<{
    name: 'AdminPrincipalLineAccountsSchemaUnavailableError';
    code: typeof ADMIN_PRINCIPAL_LINE_ACCOUNTS_SCHEMA_CODE;
  }>;

export function createAdminPrincipalLineAccountsSchemaUnavailableError(): AdminPrincipalLineAccountsSchemaUnavailableError {
  return Object.assign(
    new Error(
      'Admin database schema incomplete: apply D1 migrations that create admin_principal_line_accounts (packages/db migration 014; see schema.sql).',
    ),
    {
      name: 'AdminPrincipalLineAccountsSchemaUnavailableError' as const,
      code: ADMIN_PRINCIPAL_LINE_ACCOUNTS_SCHEMA_CODE,
    },
  );
}

export function isAdminPrincipalLineAccountsSchemaUnavailableError(
  err: unknown,
): err is AdminPrincipalLineAccountsSchemaUnavailableError {
  return (
    err instanceof Error &&
    err.name === 'AdminPrincipalLineAccountsSchemaUnavailableError' &&
    (err as { code?: unknown }).code === ADMIN_PRINCIPAL_LINE_ACCOUNTS_SCHEMA_CODE
  );
}
