/**
 * When {@link AD_PLATFORM_OUTBOUND_ENABLED} is on, `POST /api/ad-platforms/:id/sync` validates stored
 * credentials against each vendor's HTTPS API (read-only checks). Uses DNS assertion + manual redirects.
 *
 * `credentials_enc` must be JSON: `{ "accessToken": "<oauth or system token>" }` (also accepts `access_token`).
 * TikTok additionally needs an advertiser id in `externalAccountRef` on the row or `advertiserId` in JSON.
 */

import type { AdPlatformConnectionRow, AdPlatformProvider } from '@line-crm/db';
import { fetchHttpsUrlAfterDnsAssertion } from './outbound-https-fetch.js';
import { isSafeHttpsOutboundUrl } from './outbound-url.js';

export type AdPlatformSyncOk = Readonly<{
  ok: true;
  provider: AdPlatformProvider;
  checkedAt: string;
  summary: Readonly<Record<string, unknown>>;
}>;

export type AdPlatformSyncErr = Readonly<{
  ok: false;
  error: string;
  upstreamStatus?: number;
}>;

export type AdPlatformSyncResult = AdPlatformSyncOk | AdPlatformSyncErr;

function readAccessToken(cred: Record<string, unknown>): string | null {
  const t = cred.accessToken ?? cred.access_token;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

function readAdvertiserId(
  row: AdPlatformConnectionRow,
  cred: Record<string, unknown>,
): string | null {
  const fromCred = cred.advertiserId ?? cred.advertiser_id;
  if (typeof fromCred === 'string' && fromCred.trim()) return fromCred.trim();
  const ext = row.external_account_ref?.trim();
  return ext || null;
}

async function readJsonResponseBody(response: Response): Promise<unknown> {
  const ct = response.headers.get('Content-Type') ?? '';
  if (!ct.includes('application/json')) {
    const t = await response.text();
    return t.length > 4_096 ? t.slice(0, 4_096) : t;
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function metaSync(token: string, fetchFn: typeof fetch): Promise<AdPlatformSyncResult> {
  const url = `https://graph.facebook.com/v21.0/me?fields=id,name`;
  if (!isSafeHttpsOutboundUrl(url)) {
    return { ok: false, error: 'Internal: blocked Meta Graph URL' };
  }
  const r = await fetchHttpsUrlAfterDnsAssertion(url, fetchFn, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    return { ok: false, error: r.reason };
  }
  const res = r.response;
  const body = await readJsonResponseBody(res);
  if (!res.ok) {
    const msg =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      (body as { error?: { message?: string } }).error?.message
        ? String((body as { error: { message?: string } }).error.message)
        : `Meta API HTTP ${res.status}`;
    return { ok: false, error: msg.slice(0, 500), upstreamStatus: res.status };
  }
  const id =
    body && typeof body === 'object' && 'id' in body
      ? String((body as { id?: unknown }).id ?? '')
      : '';
  const name =
    body && typeof body === 'object' && 'name' in body
      ? String((body as { name?: unknown }).name ?? '')
      : '';
  return {
    ok: true,
    provider: 'meta',
    checkedAt: new Date().toISOString(),
    summary: { graphUserId: id || undefined, graphName: name || undefined },
  };
}

async function googleSync(token: string, fetchFn: typeof fetch): Promise<AdPlatformSyncResult> {
  const url = 'https://www.googleapis.com/oauth2/v3/userinfo';
  if (!isSafeHttpsOutboundUrl(url)) {
    return { ok: false, error: 'Internal: blocked Google userinfo URL' };
  }
  const r = await fetchHttpsUrlAfterDnsAssertion(url, fetchFn, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    return { ok: false, error: r.reason };
  }
  const res = r.response;
  const body = await readJsonResponseBody(res);
  if (!res.ok) {
    return {
      ok: false,
      error: `Google OAuth userinfo HTTP ${res.status}`,
      upstreamStatus: res.status,
    };
  }
  const sub =
    body && typeof body === 'object' && 'sub' in body
      ? String((body as { sub?: unknown }).sub ?? '')
      : '';
  const email =
    body && typeof body === 'object' && 'email' in body
      ? String((body as { email?: unknown }).email ?? '')
      : '';
  return {
    ok: true,
    provider: 'google',
    checkedAt: new Date().toISOString(),
    summary: { sub: sub || undefined, email: email || undefined },
  };
}

async function xSync(token: string, fetchFn: typeof fetch): Promise<AdPlatformSyncResult> {
  const url = 'https://api.twitter.com/2/users/me?user.fields=username';
  if (!isSafeHttpsOutboundUrl(url)) {
    return { ok: false, error: 'Internal: blocked X API URL' };
  }
  const r = await fetchHttpsUrlAfterDnsAssertion(url, fetchFn, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    return { ok: false, error: r.reason };
  }
  const res = r.response;
  const body = await readJsonResponseBody(res);
  if (!res.ok) {
    let detail = `X API HTTP ${res.status}`;
    if (body && typeof body === 'object' && 'errors' in body) {
      const errs = (body as { errors?: { message?: string }[] }).errors;
      if (Array.isArray(errs) && errs[0]?.message) detail = errs[0].message.slice(0, 500);
    }
    return { ok: false, error: detail, upstreamStatus: res.status };
  }
  const data =
    body && typeof body === 'object' && 'data' in body
      ? ((body as { data?: { id?: string; username?: string } }).data ?? undefined)
      : undefined;
  return {
    ok: true,
    provider: 'x',
    checkedAt: new Date().toISOString(),
    summary: {
      userId: data?.id,
      username: data?.username,
    },
  };
}

async function tiktokSync(
  token: string,
  advertiserId: string,
  fetchFn: typeof fetch,
): Promise<AdPlatformSyncResult> {
  const ids = encodeURIComponent(JSON.stringify([advertiserId]));
  const url = `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=${ids}`;
  if (!isSafeHttpsOutboundUrl(url)) {
    return { ok: false, error: 'Internal: blocked TikTok API URL' };
  }
  const r = await fetchHttpsUrlAfterDnsAssertion(url, fetchFn, {
    headers: { 'Access-Token': token },
  });
  if (!r.ok) {
    return { ok: false, error: r.reason };
  }
  const res = r.response;
  const body = await readJsonResponseBody(res);
  if (!res.ok) {
    return {
      ok: false,
      error: `TikTok API HTTP ${res.status}`,
      upstreamStatus: res.status,
    };
  }
  if (body && typeof body === 'object' && 'code' in body) {
    const code = (body as { code?: unknown }).code;
    if (code !== 0 && code !== '0') {
      const msg = String((body as { message?: unknown }).message ?? 'TikTok API error').slice(
        0,
        500,
      );
      return { ok: false, error: msg, upstreamStatus: res.status };
    }
  }
  let name: string | undefined;
  if (body && typeof body === 'object' && 'data' in body) {
    const data = (body as { data?: { list?: { name?: string }[] } }).data;
    const first = Array.isArray(data?.list) ? data?.list?.[0] : undefined;
    if (first?.name) name = String(first.name);
  }
  return {
    ok: true,
    provider: 'tiktok',
    checkedAt: new Date().toISOString(),
    summary: { advertiserId, advertiserName: name },
  };
}

export async function syncAdPlatformConnection(
  row: AdPlatformConnectionRow,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<AdPlatformSyncResult> {
  const raw = row.credentials_enc?.trim();
  if (!raw) {
    return {
      ok: false,
      error:
        'Missing credentials_enc. Store JSON: { "accessToken": "…" } (TikTok also needs advertiser id in externalAccountRef or advertiserId).',
    };
  }
  let cred: Record<string, unknown>;
  try {
    cred = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'credentials_enc must be valid JSON for outbound sync' };
  }
  const token = readAccessToken(cred);
  if (!token) {
    return { ok: false, error: 'JSON must include accessToken (or access_token)' };
  }

  switch (row.provider) {
    case 'meta':
      return metaSync(token, fetchFn);
    case 'google':
      return googleSync(token, fetchFn);
    case 'x':
      return xSync(token, fetchFn);
    case 'tiktok': {
      const adv = readAdvertiserId(row, cred);
      if (!adv) {
        return {
          ok: false,
          error:
            'TikTok sync requires advertiser id: set externalAccountRef or JSON advertiserId / advertiser_id',
        };
      }
      return tiktokSync(token, adv, fetchFn);
    }
    default:
      return { ok: false, error: `Unsupported provider: ${String(row.provider)}` };
  }
}
