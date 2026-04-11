/**
 * Keeps DNS SSRF checks adjacent to the outbound `fetch` (no extra work between verify and connect).
 */

import { OUTBOUND_HTTPS_FETCH_REDIRECT_MANUAL } from './outbound-url.js';
import { assertHttpsOutboundUrlResolvedSafe } from './outbound-url-resolve.js';

export type OutboundHttpsFetchResult =
  | { ok: true; response: Response }
  | { ok: false; reason: string };

export async function fetchHttpsUrlAfterDnsAssertion(
  urlString: string,
  fetchFn: typeof fetch,
  init?: RequestInit,
): Promise<OutboundHttpsFetchResult> {
  const check = await assertHttpsOutboundUrlResolvedSafe(urlString, fetchFn);
  if (!check.ok) {
    return check;
  }

  const response = await fetchFn(urlString, {
    ...init,
    ...OUTBOUND_HTTPS_FETCH_REDIRECT_MANUAL,
  });

  return { ok: true, response };
}
