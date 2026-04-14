import type { Context, Next } from 'hono';
import type { Env } from '../index.js';
import { isCloudflareAccessExemptPath } from '../services/auth-paths.js';
import {
  CF_ACCESS_JWT_HEADER,
  CLOUDFLARE_ACCESS_EMAIL_CLAIM_ERROR,
  getValidatedAccessEmailFromPayload,
  isCloudflareAccessEnforced,
} from '../services/cloudflare-access-principal.js';
import { verifyCloudflareAccessJwt } from '../services/cloudflare-access-jwt.js';
import { isTrustedCloudflareAccessServiceTokenPayload } from '../services/cloudflare-access-service-token.js';

/**
 * Optional gate: when `REQUIRE_CLOUDFLARE_ACCESS_JWT` + `CLOUDFLARE_ACCESS_TEAM_DOMAIN` are set,
 * protected routes must present a valid Cf Access JWT (see {@link CF_ACCESS_JWT_HEADER}).
 * Public paths match {@link isCloudflareAccessExemptPath} (webhook, LIFF, form submit, etc.;
 * `/api/auth/*` is not exempt so Access JWT is still required there when enforcement is on).
 */
export async function cloudflareAccessMiddleware(
  c: Context<Env>,
  next: Next,
): Promise<Response | void> {
  if (!isCloudflareAccessEnforced(c.env)) {
    return next();
  }

  // CORS preflight never sends Cf-Access-Jwt-Assertion; let prior CORS middleware answer OPTIONS.
  if (c.req.method === 'OPTIONS') {
    return next();
  }

  const url = new URL(c.req.url);
  if (isCloudflareAccessExemptPath(url.pathname, c.req.method)) {
    return next();
  }

  const jwt = c.req.header(CF_ACCESS_JWT_HEADER) ?? c.req.header('CF-Access-Jwt-Assertion') ?? '';

  const allowedEmails = c.env.CLOUDFLARE_ACCESS_ALLOWED_EMAILS?.trim();

  const audience = c.env.CLOUDFLARE_ACCESS_AUDIENCE?.trim();

  const result = await verifyCloudflareAccessJwt({
    jwt,
    teamDomain: c.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN!.trim(),
    allowedEmails: allowedEmails || undefined,
    expectedAudience: audience && audience.length > 0 ? audience : undefined,
  });

  if (!result.ok) {
    return c.json({ success: false, error: 'Cloudflare Access required' }, 403);
  }

  const email = getValidatedAccessEmailFromPayload(result.payload);
  if (email) {
    c.set('cfAccessJwtPayload', result.payload);
    return next();
  }

  if (
    isTrustedCloudflareAccessServiceTokenPayload(
      result.payload,
      c.env.CLOUDFLARE_ACCESS_TRUSTED_SERVICE_CLIENT_IDS,
    )
  ) {
    c.set('cfAccessJwtPayload', result.payload);
    c.set('cfAccessServiceAuth', true);
    return next();
  }

  return c.json({ success: false, error: CLOUDFLARE_ACCESS_EMAIL_CLAIM_ERROR }, 403);
}
