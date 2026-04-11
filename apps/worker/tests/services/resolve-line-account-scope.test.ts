import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/index.js';

const listPrincipal = vi.fn();
const getLineAccounts = vi.fn();

vi.mock('@line-crm/db', () => ({
  listPrincipalLineAccountIdsForEmail: listPrincipal,
  getLineAccounts: getLineAccounts,
}));

function mockCtx(overrides: Partial<Env['Bindings']>): Context<Env> {
  return {
    env: {
      DB: {} as D1Database,
      API_KEY: 'k',
      ...overrides,
    } as Env['Bindings'],
    get: vi.fn(),
  } as unknown as Context<Env>;
}

describe('resolveLineAccountScopeForRequest (multi-account isolation)', () => {
  beforeEach(() => {
    listPrincipal.mockReset();
    getLineAccounts.mockReset();
  });

  it('returns restricted with all active account ids when MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID and 2+ active accounts', async () => {
    getLineAccounts.mockResolvedValue([
      { id: 'a1', is_active: 1 },
      { id: 'a2', is_active: 1 },
    ]);
    const { resolveLineAccountScopeForRequest } = await import(
      '../../src/services/admin-line-account-scope.js'
    );
    const scope = await resolveLineAccountScopeForRequest(
      {} as D1Database,
      mockCtx({ MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID: '1' }),
    );
    expect(scope).toEqual({ mode: 'restricted', ids: new Set(['a1', 'a2']) });
  });

  it('returns all when multi flag set but only one active account', async () => {
    getLineAccounts.mockResolvedValue([{ id: 'a1', is_active: 1 }]);
    const { resolveLineAccountScopeForRequest } = await import(
      '../../src/services/admin-line-account-scope.js'
    );
    const scope = await resolveLineAccountScopeForRequest(
      {} as D1Database,
      mockCtx({ MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID: '1' }),
    );
    expect(scope).toEqual({ mode: 'all' });
  });
});
