/**
 * Cloudflare Access + browser CORS contract (AGENTS.md — Zero Trust + admin / BFF).
 *
 * - **Edge (Access app):** prefer **OPTIONS / preflight** bypass or Access-handled preflight
 *   (`Bypass options requests to origin` or `Configure response to preflight requests`) so
 *   browsers are not forced to send `Cf-Access-Jwt-Assertion` / `CF_Authorization` on OPTIONS
 *   (they do not send cookies on preflight by spec).
 * - **Real requests (`GET`, `POST`, …):** should run under a **normal browser profile** with
 *   `CF_Authorization` / assertion header (or service token for machine callers), not a blanket
 *   Bypass of `/api/lh-upstream/*` for all methods.
 *
 * This Worker applies the **in-process** half: skip the Access JWT gate for **any** `OPTIONS`
 * request when enforcement is on, before path exemptions, so CORS middleware can answer.
 */
export function shouldBypassCloudflareAccessJwtForCorsPreflight(method: string): boolean {
  return method.toUpperCase() === 'OPTIONS';
}
