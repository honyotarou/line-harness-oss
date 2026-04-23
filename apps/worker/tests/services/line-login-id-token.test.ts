import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getLineAccounts: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

describe('verifyLineLoginIdToken', () => {
  beforeEach(() => {
    vi.resetModules();
    dbMocks.getLineAccounts.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('verifies token and requires aud match (via line-id-token helper)', async () => {
    dbMocks.getLineAccounts.mockResolvedValue([{ login_channel_id: 'chan-2' }]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sub: 'u1', aud: 'chan-2', name: 'Alice' }),
      }),
    );

    const { verifyLineLoginIdToken } = await import('../../src/services/line-login-id-token.js');
    const out = await verifyLineLoginIdToken({} as D1Database, 'chan-2', 'tok');
    expect(out).toEqual({ sub: 'u1', name: 'Alice', loginChannelId: 'chan-2' });
  });

  it('caps the number of channel ids to prevent verification DoS', async () => {
    const { MAX_LINE_LOGIN_CHANNEL_IDS } = await import(
      '../../src/services/line-login-id-token.js'
    );
    dbMocks.getLineAccounts.mockResolvedValue(
      Array.from({ length: MAX_LINE_LOGIN_CHANNEL_IDS + 20 }, (_, i) => ({
        login_channel_id: `c-${i}`,
      })),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const { verifyLineLoginIdToken } = await import('../../src/services/line-login-id-token.js');
    const out = await verifyLineLoginIdToken({} as D1Database, 'default', 'tok');
    expect(out).toBeNull();

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(MAX_LINE_LOGIN_CHANNEL_IDS);
  });
});
