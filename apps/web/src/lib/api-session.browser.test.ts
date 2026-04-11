/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('admin session token (browser / sessionStorage)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'https://worker.test';
    sessionStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 20, hasNextPage: false },
        }),
      }),
    );
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('setAdminSessionToken persists and API requests include Authorization', async () => {
    const { setAdminSessionToken, api } = await import('./api');
    setAdminSessionToken('sess-tok');
    await api.friends.list({ accountId: 'a1' });

    const init = vi.mocked(globalThis.fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer sess-tok',
      'X-Line-Harness-Client': '1',
    });
  });

  it('getStoredAdminSessionToken swallows getItem errors (no Bearer)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const { api } = await import('./api');
    await api.friends.list({ accountId: 'a1' });
    const init = vi.mocked(globalThis.fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Line-Harness-Client': '1',
    });
  });

  it('setAdminSessionToken and clearAdminSessionToken swallow sessionStorage errors', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    const { setAdminSessionToken, clearAdminSessionToken } = await import('./api');
    expect(() => setAdminSessionToken('x')).not.toThrow();
    expect(() => clearAdminSessionToken()).not.toThrow();
    spy.mockRestore();
  });
});
