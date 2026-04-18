import type { D1Database } from '@cloudflare/workers-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/index.js';
import type { Context } from 'hono';

const listPrincipal = vi.fn();
const getLineAccounts = vi.fn();

vi.mock('@line-crm/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@line-crm/db')>();
  return {
    ...actual,
    listPrincipalLineAccountIdsForEmail: listPrincipal,
    getLineAccounts,
  };
});

vi.mock('../../src/services/cloudflare-access-principal.js', () => ({
  isCloudflareAccessEnforced: (): boolean => true,
  getCloudflareAccessEmailFromContext: (): string => 'admin@example.com',
  CLOUDFLARE_ACCESS_EMAIL_CLAIM_ERROR: 'x',
  CLOUDFLARE_ACCESS_EMAIL_REQUIRED_ERROR: 'y',
  getValidatedAccessEmailFromPayload: vi.fn(),
  CF_ACCESS_JWT_HEADER: 'cf-access-jwt-assertion',
}));

function mockCtx(): Context<Env> {
  return {
    env: {
      DB: {} as D1Database,
      API_KEY: 'k',
      REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
    } as Env['Bindings'],
    get: vi.fn(),
  } as unknown as Context<Env>;
}

describe('resolveLineAccountScopeForRequest (Access + D1 migration)', () => {
  beforeEach(() => {
    listPrincipal.mockReset();
    getLineAccounts.mockReset();
  });

  it('throws AdminPrincipalLineAccountsSchemaUnavailableError when admin_principal_line_accounts is missing', async () => {
    listPrincipal.mockRejectedValue(
      new Error('D1_ERROR: no such table: admin_principal_line_accounts: SQLITE_ERROR'),
    );
    const { resolveLineAccountScopeForRequest } = await import(
      '../../src/services/admin-line-account-scope.js'
    );
    const { AdminPrincipalLineAccountsSchemaUnavailableError } = await import(
      '../../src/services/admin-principal-line-accounts-schema-error.js'
    );
    await expect(
      resolveLineAccountScopeForRequest({} as D1Database, mockCtx()),
    ).rejects.toBeInstanceOf(AdminPrincipalLineAccountsSchemaUnavailableError);
  });

  it('rethrows non-schema D1 errors', async () => {
    listPrincipal.mockRejectedValue(new Error('database disk image is malformed'));
    const { resolveLineAccountScopeForRequest } = await import(
      '../../src/services/admin-line-account-scope.js'
    );
    await expect(resolveLineAccountScopeForRequest({} as D1Database, mockCtx())).rejects.toThrow(
      /malformed/,
    );
  });
});
