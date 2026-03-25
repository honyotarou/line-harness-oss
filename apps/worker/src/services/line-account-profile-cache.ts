const PROFILE_CACHE_TTL_MS = 15 * 60_000;
const inFlightProfileRefreshes = new Map<string, Promise<LineAccountProfile>>();

interface LineAccountLike {
  id: string;
  channel_access_token: string;
}

interface CachedLineAccountProfileRow {
  display_name: string | null;
  picture_url: string | null;
  basic_id: string | null;
  fetched_at: string;
}

export interface LineAccountProfile {
  displayName: string | null;
  pictureUrl: string | null;
  basicId: string | null;
}

export function resetLineAccountProfileInflightState(): void {
  inFlightProfileRefreshes.clear();
}

async function defaultFetchBotProfile(accessToken: string): Promise<LineAccountProfile> {
  const res = await fetch('https://api.line.me/v2/bot/info', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`LINE bot info fetch failed: ${res.status}`);
  }

  const data = await res.json() as {
    displayName?: string;
    pictureUrl?: string;
    basicId?: string;
  };

  return {
    displayName: data.displayName ?? null,
    pictureUrl: data.pictureUrl ?? null,
    basicId: data.basicId ?? null,
  };
}

function toProfile(row: CachedLineAccountProfileRow | null): LineAccountProfile | null {
  if (!row) {
    return null;
  }

  return {
    displayName: row.display_name,
    pictureUrl: row.picture_url,
    basicId: row.basic_id,
  };
}

export async function loadLineAccountProfile(
  db: D1Database,
  account: LineAccountLike,
  options?: {
    now?: number;
    fetchBotProfile?: (accessToken: string) => Promise<LineAccountProfile>;
  },
): Promise<LineAccountProfile> {
  const now = options?.now ?? Date.now();
  const fetchBotProfile = options?.fetchBotProfile ?? defaultFetchBotProfile;
  const canUseDb = typeof db.prepare === 'function';

  let cachedRow: CachedLineAccountProfileRow | null = null;

  if (canUseDb) {
    cachedRow = await db
      .prepare(`SELECT * FROM line_account_profile_cache WHERE line_account_id = ?`)
      .bind(account.id)
      .first<CachedLineAccountProfileRow>();

    if (cachedRow && now - new Date(cachedRow.fetched_at).getTime() < PROFILE_CACHE_TTL_MS) {
      return toProfile(cachedRow)!;
    }
  }

  try {
    let refreshPromise = inFlightProfileRefreshes.get(account.id);
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const fresh = await fetchBotProfile(account.channel_access_token);

        if (canUseDb) {
          const nowIso = new Date(now).toISOString();
          await db
            .prepare(
              `INSERT INTO line_account_profile_cache
                 (line_account_id, display_name, picture_url, basic_id, fetched_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(line_account_id)
               DO UPDATE SET
                 display_name = excluded.display_name,
                 picture_url = excluded.picture_url,
                 basic_id = excluded.basic_id,
                 fetched_at = excluded.fetched_at,
                 updated_at = excluded.updated_at`,
            )
            .bind(account.id, fresh.displayName, fresh.pictureUrl, fresh.basicId, nowIso, nowIso)
            .run();
        }

        return fresh;
      })().finally(() => {
        inFlightProfileRefreshes.delete(account.id);
      });
      inFlightProfileRefreshes.set(account.id, refreshPromise);
    }

    const fresh = await refreshPromise;
    return fresh;
  } catch {
    return toProfile(cachedRow) ?? {
      displayName: null,
      pictureUrl: null,
      basicId: null,
    };
  }
}
