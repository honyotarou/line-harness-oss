/**
 * Normalize `Set-Cookie` from an upstream API Worker so the browser stores it on the **admin
 * site origin** (same host as the admin-access-proxy BFF), not on the upstream hostname.
 *
 * Upstream may emit `Domain=*.workers.dev` (or similar); browsers will then ignore or mis-scope
 * the cookie when the document is `https://admin.example/`. Strip `Domain=` and force `Path=/`.
 */
export function rewriteSetCookieLineForAdminBrowserOrigin(setCookieHeaderValue: string): string {
  const trimmed = setCookieHeaderValue.trim();
  if (!trimmed) {
    return trimmed;
  }
  const segments = trimmed
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!segments.length) {
    return trimmed;
  }
  const [nameValue, ...attrParts] = segments;
  const withoutDomainAndPath = attrParts.filter((p) => !/^domain=/i.test(p) && !/^path=/i.test(p));
  return [nameValue, ...withoutDomainAndPath, 'Path=/'].join('; ');
}

function readCookieNameFromSetCookieLine(setCookieHeaderValue: string): string {
  const trimmed = setCookieHeaderValue.trim();
  if (!trimmed) return '';
  const first = trimmed.split(';', 1)[0] ?? '';
  const eq = first.indexOf('=');
  if (eq <= 0) return '';
  return first.slice(0, eq).trim();
}

function isCloudflareManagedCookieName(name: string): boolean {
  // Cloudflare Access / edge managed cookies (human SSO + service tokens).
  if (!name) return false;
  if (name.startsWith('CF_')) return true;
  // Other common Cloudflare cookies we never want to forward between origins.
  if (name.startsWith('__cf')) return true;
  if (name === '_cfuvid') return true;
  return false;
}

/**
 * Whether an upstream `Set-Cookie` line should be forwarded to the admin browser origin.
 * Cloudflare-managed cookies must never be proxied; only app-owned cookies (e.g. `lh_admin_session`)
 * should cross this boundary.
 */
export function shouldForwardSetCookieLineToAdminBrowserOrigin(
  setCookieHeaderValue: string,
): boolean {
  const name = readCookieNameFromSetCookieLine(setCookieHeaderValue);
  if (!name) return false;
  return !isCloudflareManagedCookieName(name);
}

/**
 * Strip Cloudflare-managed cookies from a `Cookie:` request header value before forwarding to the
 * upstream API. Prevents mixing Access human cookies (CF_Authorization etc.) with service-token auth.
 */
export function stripCloudflareCookiesFromCookieHeader(cookieHeaderValue: string): string {
  const raw = cookieHeaderValue.trim();
  if (!raw) return '';
  const parts = raw
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    const name = (eq <= 0 ? '' : part.slice(0, eq)).trim();
    if (!name) continue;
    if (isCloudflareManagedCookieName(name)) continue;
    kept.push(part);
  }
  return kept.join('; ');
}
