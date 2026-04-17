/**
 * Cloudflare Access + browser CORS contract (AGENTS.md — Zero Trust + admin / BFF).
 *
 * Official [Allow preflighted requests](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/#allow-preflighted-requests)
 * lists Option 1 (Bypass OPTIONS to origin), Option 2 (Configure response to preflight), Option 3
 * (Worker service auth). **This repository does not use Access CORS Option 1** — preflight is
 * handled with **Option 2** in Zero Trust (Access answers `OPTIONS`; mirror real `GET`/`POST`
 * CORS headers from the origin in the Access app). Cross-origin admin uses **Option 3** patterns
 * (`/api/lh-upstream` BFF) per AGENTS.md.
 *
 * Browsers **never** send `Cf-Access-Jwt-Assertion` / `CF_Authorization` on `OPTIONS` by spec.
 *
 * **Real requests (`GET`, `POST`, …):** use a **normal browser profile** with `CF_Authorization`
 * / assertion header (or a service token for machine callers). Do not add Access **Policies**
 * Bypass for `/api/lh-upstream/*` for all methods (breaks edge auth).
 *
 * **This Worker (in-process):** if an `OPTIONS` still reaches the Worker (local dev, probes, or
 * misconfiguration), skip the Access JWT gate for **any** `OPTIONS` before path exemptions so CORS
 * middleware can answer — this is **not** an endorsement of Access “Bypass options to origin”.
 */
export function shouldBypassCloudflareAccessJwtForCorsPreflight(method: string): boolean {
  return method.toUpperCase() === 'OPTIONS';
}
