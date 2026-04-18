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
