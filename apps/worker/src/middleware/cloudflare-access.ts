import type { Context, Next } from 'hono';
import type { Env } from '../index.js';
import { isCloudflareAccessExemptPath } from '../services/auth-paths.js';
import {
  CF_ACCESS_JWT_HEADER,
  isCloudflareAccessEnforced,
  verifyCloudflareAccessJwt,
} from '../services/cloudflare-access-jwt.js';

/**
 * Optional gate: when `REQUIRE_CLOUDFLARE_ACCESS_JWT` + `CLOUDFLARE_ACCESS_TEAM_DOMAIN` are set,
 * protected routes must present a valid {@link CF_ACCESS_JWT_HEADER} (Cloudflare Zero Trust / Access).
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

  const url = new URL(c.req.url);
  if (isCloudflareAccessExemptPath(url.pathname, c.req.method)) {
    return next();
  }

  const jwt = c.req.header(CF_ACCESS_JWT_HEADER) ?? c.req.header('CF-Access-Jwt-Assertion') ?? '';

  const allowedEmails = c.env.CLOUDFLARE_ACCESS_ALLOWED_EMAILS?.trim();

  const result = await verifyCloudflareAccessJwt({
    jwt,
    teamDomain: c.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN!.trim(),
    allowedEmails: allowedEmails || undefined,
  });

  if (!result.ok) {
    return c.json({ success: false, error: 'Cloudflare Access required' }, 403);
  }

  c.set('cfAccessJwtPayload', result.payload);
  return next();
}
