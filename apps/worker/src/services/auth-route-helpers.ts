import { parseBearerAuthorization } from './bearer-authorization.js';
import { readAdminSessionCookie } from './admin-session.js';
import { isCloudflareAccessEnforced } from './cloudflare-access-principal.js';
import {
  formatDeployedSecurityRelaxPairHint,
  isStrictDeployedHttpsSurface,
} from './deployed-security-defaults.js';

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function allowLegacyApiKeyBearerSession(env: {
  ALLOW_LEGACY_API_KEY_BEARER_SESSION?: string;
  WORKER_URL?: string;
  RELAX_DEPLOYED_SECURITY_DEFAULTS?: string;
  RELAX_DEPLOYED_SECURITY_CONFIRM?: string;
}): boolean {
  // Never allow API_KEY as a Bearer "session" on strict public HTTPS surfaces.
  if (isStrictDeployedHttpsSurface(env)) {
    return false;
  }
  return isTruthyEnvFlag(env.ALLOW_LEGACY_API_KEY_BEARER_SESSION);
}

/** When true, login JSON includes `sessionToken` for cross-origin admins that cannot use HttpOnly cookies (Bearer). Default off — prefer cookie + `/api/auth/session`. */
export function includeSessionTokenInLoginBody(env: {
  INCLUDE_SESSION_TOKEN_IN_LOGIN_BODY?: string;
}): boolean {
  return isTruthyEnvFlag(env.INCLUDE_SESSION_TOKEN_IN_LOGIN_BODY);
}

export function getAdminAuthToken(c: { req: { header: (name: string) => string | undefined } }):
  | string
  | null {
  const bearer = parseBearerAuthorization(c.req.header('Authorization'));
  if (bearer) {
    return bearer;
  }
  return readAdminSessionCookie(c as never);
}

export function strictHttpsCloudflareAccessRequiredError(
  env: {
    WORKER_URL?: string;
    REQUIRE_CLOUDFLARE_ACCESS_JWT?: string;
    CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
    RELAX_DEPLOYED_SECURITY_DEFAULTS?: string;
    RELAX_DEPLOYED_SECURITY_CONFIRM?: string;
  },
  kind: 'login' | 'session',
): string | null {
  if (!isStrictDeployedHttpsSurface(env)) {
    return null;
  }
  if (isCloudflareAccessEnforced(env)) {
    return null;
  }
  return `Cloudflare Access is required for admin ${kind} on this HTTPS Worker; set REQUIRE_CLOUDFLARE_ACCESS_JWT + CLOUDFLARE_ACCESS_TEAM_DOMAIN (or ${formatDeployedSecurityRelaxPairHint()} for staging relax).`;
}
