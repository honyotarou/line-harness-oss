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
        json: async () => ({ sub: 'line-user-1', name: 'Alice', aud: 'channel-2' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyLineIdToken('valid-token', ['channel-1', 'channel-2'])).resolves.toEqual({
      sub: 'line-user-1',
      name: 'Alice',
      loginChannelId: 'channel-2',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when no channel can verify the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(verifyLineIdToken('invalid-token', ['channel-1'])).resolves.toBeNull();
  });

  it('verifies channel ids in order and stops at the first success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sub: 'line-user-2', aud: 'channel-2' }),
      });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      verifyLineIdToken('valid-token', ['channel-1', 'channel-2', 'channel-3']),
    ).resolves.toEqual({
      sub: 'line-user-2',
      loginChannelId: 'channel-2',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when verify response aud does not match the channel id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sub: 'line-user-3', aud: 'wrong-channel' }),
      }),
    );

    await expect(verifyLineIdToken('token', ['expected-channel'])).resolves.toBeNull();
  });
});
