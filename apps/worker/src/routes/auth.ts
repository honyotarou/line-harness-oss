/** Admin auth (login/session/logout) + Access bootstrap redirect (`/api/auth/access-bootstrap`). */
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
import { formatDeployedSecurityRelaxPairHint } from '../services/deployed-security-defaults.js';
import { respondMissingAdminSession } from '../services/auth-session-response.js';
import { timingSafeEqualUtf8 } from '../services/timing-safe-equal.js';
import {
  allowLegacyApiKeyBearerSession,
  getAdminAuthToken,
  includeSessionTokenInLoginBody,
  strictHttpsCloudflareAccessRequiredError,
} from '../services/auth-route-helpers.js';
import { respondAuthAccessBootstrapGet } from '../services/auth-access-bootstrap-handoff.js';

const authRoutes = new Hono<Env>();
const LOGIN_BODY_LIMIT_BYTES = 8 * 1024;
/** Tight bucket encourages API key brute-force resistance; raised above naive "5" to tolerate SSO edge reload loops. */
const LOGIN_RATE_LIMIT = { limit: 24, windowMs: 60_000 };
const SESSION_CHECK_RATE_LIMIT = { limit: 300, windowMs: 60_000 };

authRoutes.post('/api/auth/login', async (c) => {
  try {
    const strictErr = strictHttpsCloudflareAccessRequiredError(c.env, 'login');
    if (strictErr) {
      return c.json(
        {
          success: false,
          error: strictErr,
        },
        503,
      );
    }

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
      if (!apiKey || !(await timingSafeEqualUtf8(apiKey, c.env.API_KEY))) {
        return c.json({ success: false, error: 'Unauthorized' }, 401);
      }
    }

    if (isAdminSessionSecretRequired(c.env) && !isDedicatedAdminSessionSecretConfigured(c.env)) {
      return c.json(
        {
          success: false,
          error: `ADMIN_SESSION_SECRET is required on this HTTPS Worker (or ${formatDeployedSecurityRelaxPairHint()} for staging relax, or ALLOW_LEGACY_API_KEY_SESSION_SIGNER=1 only for migration); set a dedicated session signing secret.`,
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

    const data: {
      expiresAt: string;
      sessionToken?: string;
      email?: string;
    } = {
      expiresAt,
      ...(emailFromAccess ? { email: emailFromAccess } : {}),
    };
    if (includeSessionTokenInLoginBody(c.env)) {
      /** Same value as HttpOnly cookie; enable INCLUDE_SESSION_TOKEN_IN_LOGIN_BODY when the admin UI cannot rely on credentialed cookies alone. */
      data.sessionToken = token;
    }

    return c.json({
      success: true,
      data,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'BodyTooLargeError') {
      return c.json({ success: false, error: 'Request body too large' }, 413);
    }
    if (err instanceof Error && err.name === 'InvalidJsonBodyError') {
      return c.json({ success: false, error: 'Invalid JSON body' }, 400);
    }
    console.error('POST /api/auth/login error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

authRoutes.get('/api/auth/access-bootstrap', respondAuthAccessBootstrapGet);

authRoutes.get('/api/auth/session', async (c) => {
  try {
    const strictErr = strictHttpsCloudflareAccessRequiredError(c.env, 'session');
    if (strictErr) {
      return c.json(
        {
          success: false,
          error: strictErr,
        },
        503,
      );
    }

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
      return respondMissingAdminSession(c);
    }

    const apiKey = c.env.API_KEY ?? '';
    if (await timingSafeEqualUtf8(token, apiKey)) {
      if (!allowLegacyApiKeyBearerSession(c.env)) {
        return c.json(
          { success: false, error: 'Unauthorized', code: 'API_KEY_BEARER_SESSION_FORBIDDEN' },
          401,
        );
      }
      return c.json({ success: true, data: { authenticated: true } });
    }

    const sessionSecret = resolveAdminSessionSecret(c.env);
    if (!sessionSecret) {
      return c.json(
        { success: false, error: 'Unauthorized', code: 'ADMIN_SESSION_SECRET_UNCONFIGURED' },
        401,
      );
    }
    const ok = await isValidAdminAuthToken(sessionSecret, token, c.env.DB);
    if (!ok) {
      return c.json({ success: false, error: 'Unauthorized', code: 'INVALID_ADMIN_SESSION' }, 401);
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
    !(await hasValidAdminBrowserClientHeader(c.req, c.env))
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const bearer = parseBearerAuthorization(authz);
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
