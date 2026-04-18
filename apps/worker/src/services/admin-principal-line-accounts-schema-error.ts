export class AdminPrincipalLineAccountsSchemaUnavailableError extends Error {
  readonly code = 'ADMIN_PRINCIPAL_LINE_ACCOUNTS_SCHEMA' as const;

  constructor() {
    super(
      'Admin database schema incomplete: apply D1 migrations that create admin_principal_line_accounts (packages/db migration 014; see schema.sql).',
    );
    this.name = 'AdminPrincipalLineAccountsSchemaUnavailableError';
  }
}
