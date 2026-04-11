/**
 * Admin auth: API key and/or Cloudflare Access JWT at login, then HMAC session cookie/Bearer.
 * For passwordless enterprise login, prefer Cloudflare Access (with IdP MFA) rather than embedding WebAuthn here.
 */
import { Hono } from 'hono';
import type { Env } from '../index.js';
import { revokeAdminSessionJti } from '@line-crm/db';
import {
  clearAdminSessionCookie,
  isAdminSessionSecretRequired,
  isDedicatedAdminSessionSecretConfigured,
  isValidAdminAuthToken,
  issueAdminSessionToken,
  readAdminSessionCookie,
  resolveAdminSessionSecret,
  verifyAdminSessionToken,
  writeAdminSessionCookie,
} from '../services/admin-session.js';
import {
  BodyTooLargeError,
  InvalidJsonBodyError,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import { enforceRateLimit } from '../services/request-rate-limit.js';
import {
  hasValidAdminBrowserClientHeader,
  shouldRequireAdminBrowserClientHeader,
} from '../services/admin-browser-csrf.js';
import { parseBearerAuthorization } from '../services/bearer-authorization.js';
import {
  getValidatedAccessEmailFromPayload,
  isCloudflareAccessEnforced,
} from '../services/cloudflare-access-principal.js';
import { timingSafeEqualUtf8 } from '../services/timing-safe-equal.js';

const authRoutes = new Hono<Env>();
const LOGIN_BODY_LIMIT_BYTES = 8 * 1024;
const LOGIN_RATE_LIMIT = { limit: 5, windowMs: 60_000 };
const SESSION_CHECK_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

function allowLegacyApiKeyBearerSession(env: {
  ALLOW_LEGACY_API_KEY_BEARER_SESSION?: string;
}): boolean {
  const v = env.ALLOW_LEGACY_API_KEY_BEARER_SESSION?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function getBearerToken(header: string | undefined): string | null {
  return parseBearerAuthorization(header);
}

function getAdminAuthToken(c: { req: { header: (name: string) => string | undefined } }):
  | string
  | null {
  const bearer = getBearerToken(c.req.header('Authorization'));
  if (bearer) {
    return bearer;
  }
  return readAdminSessionCookie(c as never);
}

authRoutes.post('/api/auth/login', async (c) => {
  try {
    const limited = await enforceRateLimit(c, {
      bucket: 'auth-login',
      db: c.env.DB,
      limit: LOGIN_RATE_LIMIT.limit,
      windowMs: LOGIN_RATE_LIMIT.windowMs,
    });
    if (limited) {
      return limited;
    }

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(
      c.req.raw,
      LOGIN_BODY_LIMIT_BYTES,
    );

    if (isCloudflareAccessEnforced(c.env)) {
      const apiKeyRaw = body.apiKey;
      if (apiKeyRaw !== undefined && apiKeyRaw !== null && String(apiKeyRaw).trim() !== '') {
        return c.json(
          {
            success: false,
            error:
              'apiKey must not be sent when Cloudflare Access is enforced; complete Google login at the Access gate, then call login with an empty JSON object {}.',
          },
          400,
        );
      }
      const accessPayload = c.get('cfAccessJwtPayload');
      if (!accessPayload) {
        return c.json(
          {
            success: false,
            error:
              'Cloudflare Access JWT missing; ensure Cf-Access-Jwt-Assertion reaches the Worker.',
          },
          401,
        );
      }
    } else {
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
      if (!apiKey || !timingSafeEqualUtf8(apiKey, c.env.API_KEY)) {
        return c.json({ success: false, error: 'Unauthorized' }, 401);
      }
    }

    if (isAdminSessionSecretRequired(c.env) && !isDedicatedAdminSessionSecretConfigured(c.env)) {
      return c.json(
        {
          success: false,
          error:
            'REQUIRE_ADMIN_SESSION_SECRET is enabled but ADMIN_SESSION_SECRET is not configured; set a dedicated session signing secret.',
        },
        503,
      );
    }

    const sessionSecret = resolveAdminSessionSecret(c.env);
    if (!sessionSecret) {
      return c.json(
        {
          success: false,
          error:
            'Admin session signing is not configured: set ADMIN_SESSION_SECRET (wrangler secret) for this HTTPS Worker, or set ALLOW_LEGACY_API_KEY_SESSION_SIGNER=1 only during migration.',
        },
        503,
      );
    }
    const token = await issueAdminSessionToken(sessionSecret);
    writeAdminSessionCookie(c, token);
    const payload = await verifyAdminSessionToken(sessionSecret, token);
    const expiresAt = payload
      ? new Date(payload.exp * 1000).toISOString()
      : new Date(Date.now() + 12 * 60 * 60_000).toISOString();

    const cfPayload = isCloudflareAccessEnforced(c.env) ? c.get('cfAccessJwtPayload') : undefined;
    const emailFromAccess = getValidatedAccessEmailFromPayload(cfPayload);

    return c.json({
      success: true,
      data: {
        expiresAt,
        /** Same value as HttpOnly cookie; use when the admin UI and API are on different sites (cross-origin cookies blocked). */
        sessionToken: token,
        ...(emailFromAccess ? { email: emailFromAccess } : {}),
      },
    });
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return c.json({ success: false, error: 'Request body too large' }, 413);
    }
    if (err instanceof InvalidJsonBodyError) {
      return c.json({ success: false, error: 'Invalid JSON body' }, 400);
    }
    console.error('POST /api/auth/login error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

authRoutes.get('/api/auth/session', async (c) => {
  try {
    const limited = await enforceRateLimit(c, {
      bucket: 'auth-session',
      db: c.env.DB,
      limit: SESSION_CHECK_RATE_LIMIT.limit,
      windowMs: SESSION_CHECK_RATE_LIMIT.windowMs,
    });
    if (limited) {
      return limited;
    }

    const token = getAdminAuthToken(c);
    if (!token) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    if (token === c.env.API_KEY) {
      if (!allowLegacyApiKeyBearerSession(c.env)) {
        return c.json({ success: false, error: 'Unauthorized' }, 401);
      }
      return c.json({ success: true, data: { authenticated: true } });
    }

    const sessionSecret = resolveAdminSessionSecret(c.env);
    if (!sessionSecret) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }
    const ok = await isValidAdminAuthToken(sessionSecret, token, c.env.DB);
    if (!ok) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    return c.json({ success: true, data: { authenticated: true } });
  } catch (err) {
    console.error('GET /api/auth/session error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

authRoutes.post('/api/auth/logout', async (c) => {
  const authz = c.req.header('Authorization');
  const cookieTok = readAdminSessionCookie(c);
  if (
    shouldRequireAdminBrowserClientHeader(c.req.method, authz, cookieTok) &&
    !hasValidAdminBrowserClientHeader(c.req)
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const bearer = getBearerToken(authz);
  const sessionToken = bearer ?? cookieTok;
  const logoutSecret = resolveAdminSessionSecret(c.env);
  if (sessionToken && c.env.DB && logoutSecret) {
    const session = await verifyAdminSessionToken(logoutSecret, sessionToken);
    if (session?.jti) {
      await revokeAdminSessionJti(c.env.DB, session.jti);
    }
  }

  clearAdminSessionCookie(c);
  return c.json({ success: true, data: null });
});

export { authRoutes };
