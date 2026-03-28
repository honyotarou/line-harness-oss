import { beforeEach, describe, expect, it, vi } from 'vitest';

function createProfileCacheDb(
  initialRows: Record<
    string,
    {
      display_name: string | null;
      picture_url: string | null;
      basic_id: string | null;
      fetched_at: string;
      updated_at: string;
    }
  > = {},
) {
  const rows = new Map(Object.entries(initialRows));

  return {
    rows,
    db: {
      prepare(sql: string) {
        return {
          bind(...bindings: unknown[]) {
            return {
              async first<T>() {
                if (sql.includes('SELECT * FROM line_account_profile_cache')) {
                  const [lineAccountId] = bindings as [string];
                  return (rows.get(lineAccountId) ?? null) as T | null;
                }
                throw new Error(`Unexpected first SQL: ${sql}`);
              },
              async run() {
                if (sql.includes('INSERT INTO line_account_profile_cache')) {
                  const [lineAccountId, displayName, pictureUrl, basicId, fetchedAt, updatedAt] =
                    bindings as [
                      string,
                      string | null,
                      string | null,
                      string | null,
                      string,
                      string,
                    ];
                  rows.set(lineAccountId, {
                    display_name: displayName,
                    picture_url: pictureUrl,
                    basic_id: basicId,
                    fetched_at: fetchedAt,
                    updated_at: updatedAt,
                  });
                  return { success: true };
                }
                throw new Error(`Unexpected run SQL: ${sql}`);
              },
            };
          },
        };
      },
    } as unknown as D1Database,
  };
}

describe('line account profile cache', () => {
  beforeEach(() => {
    vi.useRealTimers();
    // Reset module state between tests because concurrent refresh dedupe uses a module-level map.
    return import('../../src/services/line-account-profile-cache.js').then(
      ({ resetLineAccountProfileInflightState }) => {
        resetLineAccountProfileInflightState();
      },
    );
  });

  it('returns fresh cached profiles without calling the LINE API', async () => {
    const { db } = createProfileCacheDb({
      'account-1': {
        display_name: 'Cached Name',
        picture_url: 'https://example.com/cached.png',
        basic_id: '@cached',
        fetched_at: '2026-03-25T10:00:00.000Z',
        updated_at: '2026-03-25T10:00:00.000Z',
      },
    });
    const fetchBotProfile = vi.fn();

    const { loadLineAccountProfile } = await import(
      '../../src/services/line-account-profile-cache.js'
    );
    const profile = await loadLineAccountProfile(
      db,
      { id: 'account-1', channel_access_token: 'token-1' },
      {
        now: new Date('2026-03-25T10:05:00.000Z').getTime(),
        fetchBotProfile,
      },
    );

    expect(profile).toEqual({
      displayName: 'Cached Name',
      pictureUrl: 'https://example.com/cached.png',
      basicId: '@cached',
    });
    expect(fetchBotProfile).not.toHaveBeenCalled();
  });

  it('refreshes stale profiles and stores the latest LINE bot info', async () => {
    const cache = createProfileCacheDb({
      'account-1': {
        display_name: 'Old Name',
        picture_url: null,
        basic_id: null,
        fetched_at: '2026-03-25T09:00:00.000Z',
        updated_at: '2026-03-25T09:00:00.000Z',
      },
    });
    const fetchBotProfile = vi.fn().mockResolvedValue({
      displayName: 'Fresh Name',
      pictureUrl: 'https://example.com/fresh.png',
      basicId: '@fresh',
    });

    const { loadLineAccountProfile } = await import(
      '../../src/services/line-account-profile-cache.js'
    );
    const profile = await loadLineAccountProfile(
      cache.db,
      { id: 'account-1', channel_access_token: 'token-1' },
      {
        now: new Date('2026-03-25T10:20:00.000Z').getTime(),
        fetchBotProfile,
      },
    );

    expect(profile).toEqual({
      displayName: 'Fresh Name',
      pictureUrl: 'https://example.com/fresh.png',
      basicId: '@fresh',
    });
    expect(fetchBotProfile).toHaveBeenCalledWith('token-1');
    expect(cache.rows.get('account-1')).toMatchObject({
      display_name: 'Fresh Name',
      picture_url: 'https://example.com/fresh.png',
      basic_id: '@fresh',
    });
  });

  it('falls back to stale cache when the refresh request fails', async () => {
    const { db } = createProfileCacheDb({
      'account-1': {
        display_name: 'Old Name',
        picture_url: 'https://example.com/old.png',
        basic_id: '@old',
        fetched_at: '2026-03-25T09:00:00.000Z',
        updated_at: '2026-03-25T09:00:00.000Z',
      },
    });
    const fetchBotProfile = vi.fn().mockRejectedValue(new Error('LINE unavailable'));

    const { loadLineAccountProfile } = await import(
      '../../src/services/line-account-profile-cache.js'
    );
    const profile = await loadLineAccountProfile(
      db,
      { id: 'account-1', channel_access_token: 'token-1' },
      {
        now: new Date('2026-03-25T10:20:00.000Z').getTime(),
        fetchBotProfile,
      },
    );

    expect(profile).toEqual({
      displayName: 'Old Name',
      pictureUrl: 'https://example.com/old.png',
      basicId: '@old',
    });
  });

  it('deduplicates concurrent refreshes for the same account', async () => {
    const cache = createProfileCacheDb();
    let resolveFetch:
      | ((value: { displayName: string; pictureUrl: string; basicId: string }) => void)
      | undefined;
    const fetchBotProfile = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { loadLineAccountProfile } = await import(
      '../../src/services/line-account-profile-cache.js'
    );

    const first = loadLineAccountProfile(
      cache.db,
      { id: 'account-1', channel_access_token: 'token-1' },
      { now: new Date('2026-03-25T10:20:00.000Z').getTime(), fetchBotProfile },
    );
    const second = loadLineAccountProfile(
      cache.db,
      { id: 'account-1', channel_access_token: 'token-1' },
      { now: new Date('2026-03-25T10:20:00.000Z').getTime(), fetchBotProfile },
    );

    await Promise.resolve();
    expect(fetchBotProfile).toHaveBeenCalledTimes(1);
    resolveFetch?.({
      displayName: 'Fresh Name',
      pictureUrl: 'https://example.com/fresh.png',
      basicId: '@fresh',
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        displayName: 'Fresh Name',
        pictureUrl: 'https://example.com/fresh.png',
        basicId: '@fresh',
      },
      {
        displayName: 'Fresh Name',
        pictureUrl: 'https://example.com/fresh.png',
        basicId: '@fresh',
      },
    ]);
  });
});
