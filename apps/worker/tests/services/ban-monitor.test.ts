import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getLineAccounts: vi.fn(),
  createAccountHealthLog: vi.fn(),
}));

vi.mock('@line-crm/db', () => ({
  getLineAccounts: dbMocks.getLineAccounts,
  createAccountHealthLog: dbMocks.createAccountHealthLog,
}));

function createD1(sentCount: number) {
  return {
    prepare() {
      return {
        bind() {
          return {
            async first<T>() {
              return { count: sentCount } as T;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe('checkAccountHealth', () => {
  beforeEach(() => {
    dbMocks.getLineAccounts.mockReset();
    dbMocks.createAccountHealthLog.mockReset();
    dbMocks.createAccountHealthLog.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips inactive accounts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    dbMocks.getLineAccounts.mockResolvedValue([{ id: 'a1', is_active: 0, channel_access_token: 't' }]);

    const { checkAccountHealth } = await import('../../src/services/ban-monitor.js');
    await checkAccountHealth(createD1(0));

    expect(dbMocks.createAccountHealthLog).not.toHaveBeenCalled();
  });

  it('records danger when LINE /v2/bot/info returns 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    );
    dbMocks.getLineAccounts.mockResolvedValue([{ id: 'acc-1', is_active: 1, channel_access_token: 'tok' }]);

    const { checkAccountHealth } = await import('../../src/services/ban-monitor.js');
    await checkAccountHealth(createD1(0));

    expect(dbMocks.createAccountHealthLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lineAccountId: 'acc-1',
        riskLevel: 'danger',
        errorCode: 403,
      }),
    );
  });

  it('records warning on HTTP 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429 }),
    );
    dbMocks.getLineAccounts.mockResolvedValue([{ id: 'acc-2', is_active: 1, channel_access_token: 'tok' }]);

    const { checkAccountHealth } = await import('../../src/services/ban-monitor.js');
    await checkAccountHealth(createD1(0));

    expect(dbMocks.createAccountHealthLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lineAccountId: 'acc-2',
        riskLevel: 'warning',
        errorCode: 429,
      }),
    );
  });

  it('records warning when outgoing volume exceeds threshold', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    dbMocks.getLineAccounts.mockResolvedValue([{ id: 'acc-3', is_active: 1, channel_access_token: 'tok' }]);

    const { checkAccountHealth } = await import('../../src/services/ban-monitor.js');
    await checkAccountHealth(createD1(6000));

    expect(dbMocks.createAccountHealthLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lineAccountId: 'acc-3',
        riskLevel: 'warning',
      }),
    );
  });
});
