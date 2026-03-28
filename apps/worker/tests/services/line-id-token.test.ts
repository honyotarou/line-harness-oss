import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectLineLoginChannelIds, verifyLineIdToken } from '../../src/services/line-id-token.js';

describe('line-id-token helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collects unique login channel ids from the default account and db accounts', () => {
    expect(
      collectLineLoginChannelIds('default-channel', [
        { login_channel_id: 'account-channel-1' },
        { login_channel_id: 'account-channel-1' },
        { login_channel_id: null },
      ]),
    ).toEqual(['default-channel', 'account-channel-1']);
  });

  it('verifies against each channel id until one succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sub: 'line-user-1', name: 'Alice' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyLineIdToken('valid-token', ['channel-1', 'channel-2'])).resolves.toEqual({
      sub: 'line-user-1',
      name: 'Alice',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when no channel can verify the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(verifyLineIdToken('invalid-token', ['channel-1'])).resolves.toBeNull();
  });

  it('starts verification requests for all channel ids instead of waiting sequentially', async () => {
    let resolveSlow: ((value: { ok: boolean; json: () => Promise<never> }) => void) | null = null;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSlow = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sub: 'line-user-2' }),
      })
      .mockResolvedValueOnce({ ok: false });

    vi.stubGlobal('fetch', fetchMock);

    const verification = verifyLineIdToken('valid-token', ['channel-1', 'channel-2', 'channel-3']);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    await expect(verification).resolves.toEqual({ sub: 'line-user-2' });

    resolveSlow?.({
      ok: false,
      json: async () => {
        throw new Error('unreachable');
      },
    });
  });
});
