import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  clearAdminSessionCookie,
  issueAdminSessionToken,
  readAdminSessionCookie,
  verifyAdminSessionToken,
  writeAdminSessionCookie,
} from '../services/admin-session.js';
import {
  BodyTooLargeError,
  InvalidJsonBodyError,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import { enforceRateLimit } from '../services/request-rate-limit.js';

const authRoutes = new Hono<Env>();
const LOGIN_BODY_LIMIT_BYTES = 8 * 1024;
const LOGIN_RATE_LIMIT = { limit: 5, windowMs: 60_000 };

function getBearerToken(header: string | undefined): string | null {
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length);
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

    const body = await readJsonBodyWithLimit<{ apiKey?: string }>(
      c.req.raw,
      LOGIN_BODY_LIMIT_BYTES,
    );
    if (!body.apiKey || body.apiKey !== c.env.API_KEY) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const token = await issueAdminSessionToken(c.env.API_KEY);
    writeAdminSessionCookie(c, token);
    const payload = await verifyAdminSessionToken(c.env.API_KEY, token);
    const expiresAt = payload
      ? new Date(payload.exp * 1000).toISOString()
      : new Date(Date.now() + 12 * 60 * 60_000).toISOString();

    return c.json({
      success: true,
      data: {
        expiresAt,
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
    const token = getAdminAuthToken(c);
    if (!token) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    if (token === c.env.API_KEY) {
      return c.json({ success: true, data: { authenticated: true } });
    }

    const session = await verifyAdminSessionToken(c.env.API_KEY, token);
    if (!session) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    return c.json({ success: true, data: { authenticated: true } });
  } catch (err) {
    console.error('GET /api/auth/session error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

authRoutes.post('/api/auth/logout', async (c) => {
  clearAdminSessionCookie(c);
  return c.json({ success: true, data: null });
});

export { authRoutes };
