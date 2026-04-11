import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { isAdminSessionJtiRevoked } from '@line-crm/db';
import { isNonLocalHttpsWorkerUrl } from './production-cloud-policy.js';

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12;
export const ADMIN_SESSION_COOKIE_NAME = 'lh_admin_session';

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function allowsApiKeyAsAdminSessionSigner(env: {
  WORKER_URL?: string;
  ALLOW_LEGACY_API_KEY_SESSION_SIGNER?: string;
}): boolean {
  if (isTruthyEnvFlag(env.ALLOW_LEGACY_API_KEY_SESSION_SIGNER)) {
    return true;
  }
  return !isNonLocalHttpsWorkerUrl(env.WORKER_URL ?? '');
}

/**
 * HMAC secret for admin session cookies / Bearer session tokens.
 * Prefer `ADMIN_SESSION_SECRET` so a leaked session signer cannot double as `API_KEY`.
 * On a non-local HTTPS `WORKER_URL`, returns `null` unless `ADMIN_SESSION_SECRET` is set or
 * `ALLOW_LEGACY_API_KEY_SESSION_SIGNER=1` opts into signing with `API_KEY`.
 */
export function resolveAdminSessionSecret(env: {
  API_KEY: string;
  ADMIN_SESSION_SECRET?: string;
  WORKER_URL?: string;
  ALLOW_LEGACY_API_KEY_SESSION_SIGNER?: string;
}): string | null {
  const dedicated = env.ADMIN_SESSION_SECRET?.trim();
  if (dedicated) return dedicated;
  if (allowsApiKeyAsAdminSessionSigner(env)) {
    return env.API_KEY;
  }
  return null;
}

export function isDedicatedAdminSessionSecretConfigured(env: {
  ADMIN_SESSION_SECRET?: string;
}): boolean {
  const s = env.ADMIN_SESSION_SECRET?.trim();
  return s !== undefined && s.length > 0;
}

/** When enabled, login must not issue HMAC sessions signed with `API_KEY`. */
export function isAdminSessionSecretRequired(env: {
  REQUIRE_ADMIN_SESSION_SECRET?: string;
}): boolean {
  return isTruthyEnvFlag(env.REQUIRE_ADMIN_SESSION_SECRET);
}

export interface AdminSessionPayload {
  scope: 'admin';
  iat: number;
  exp: number;
  /** Present on newly issued tokens; used with D1 `admin_session_revocations` for logout. */
  jti?: string;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/**
 * SameSite=Lax by default on non-local hosts (CSRF-friendly). Set
 * `ADMIN_SESSION_COOKIE_SAMESITE_NONE=1` only when the admin UI and Worker API are on different
 * sites and the browser must send the session cookie on cross-site credentialed requests.
 */
export function resolveAdminSessionSameSite(
  hostname: string,
  env: { ADMIN_SESSION_COOKIE_SAMESITE_NONE?: string },
): 'Lax' | 'None' {
  if (isLocalHostname(hostname)) {
    return 'Lax';
  }
  return isTruthyEnvFlag(env.ADMIN_SESSION_COOKIE_SAMESITE_NONE) ? 'None' : 'Lax';
}

function getAdminSessionCookieOptions(
  request: Request,
  env: { ADMIN_SESSION_COOKIE_SAMESITE_NONE?: string },
  overrides?: {
    maxAge?: number;
  },
) {
  const url = new URL(request.url);
  const isLocal = isLocalHostname(url.hostname);
  const sameSite = resolveAdminSessionSameSite(url.hostname, env);
  const secure = !isLocal;

  return {
    path: '/',
    httpOnly: true,
    sameSite,
    secure,
    maxAge: overrides?.maxAge ?? DEFAULT_SESSION_TTL_SECONDS,
  };
}

function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(input: string): string {
  const padded = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function signPayload(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));

  let binary = '';
  for (const byte of new Uint8Array(signature)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

export async function issueAdminSessionToken(
  secret: string,
  options?: {
    issuedAt?: number;
    expiresInSeconds?: number;
    /** Tests only: fixed jti; production uses `crypto.randomUUID()`. */
    jti?: string;
  },
): Promise<string> {
  const iat = options?.issuedAt ?? Math.floor(Date.now() / 1000);
  const exp = iat + (options?.expiresInSeconds ?? DEFAULT_SESSION_TTL_SECONDS);
  const jti = options?.jti ?? crypto.randomUUID();
  const payload: AdminSessionPayload = {
    scope: 'admin',
    iat,
    exp,
    jti,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await signPayload(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifyAdminSessionToken(
  secret: string,
  token: string,
  options?: { now?: number },
): Promise<AdminSessionPayload | null> {
  const [encodedPayload, providedSignature, ...rest] = token.split('.');
  if (!encodedPayload || !providedSignature || rest.length > 0) {
    return null;
  }

  const expectedSignature = await signPayload(secret, encodedPayload);
  if (!constantTimeEqual(expectedSignature, providedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<AdminSessionPayload>;
    const now = options?.now ?? Math.floor(Date.now() / 1000);
    if (
      payload.scope !== 'admin' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    if (payload.exp <= now) {
      return null;
    }
    let jti: string | undefined;
    if (payload.jti !== undefined) {
      if (typeof payload.jti !== 'string' || payload.jti.trim() === '') {
        return null;
      }
      jti = payload.jti.trim();
    }
    return {
      scope: 'admin',
      iat: payload.iat,
      exp: payload.exp,
      ...(jti !== undefined ? { jti } : {}),
    };
  } catch {
    return null;
  }
}

export async function isValidAdminAuthToken(
  secret: string,
  token: string,
  db?: D1Database,
): Promise<boolean> {
  const session = await verifyAdminSessionToken(secret, token);
  if (!session) return false;
  if (session.jti && db) {
    if (await isAdminSessionJtiRevoked(db, session.jti)) {
      return false;
    }
  }
  return true;
}

export function readAdminSessionCookie(c: Context): string | null {
  return getCookie(c, ADMIN_SESSION_COOKIE_NAME) ?? null;
}

export function writeAdminSessionCookie(c: Context, token: string): void {
  setCookie(
    c,
    ADMIN_SESSION_COOKIE_NAME,
    token,
    getAdminSessionCookieOptions(
      c.req.raw,
      c.env as { ADMIN_SESSION_COOKIE_SAMESITE_NONE?: string },
    ),
  );
}

export function clearAdminSessionCookie(c: Context): void {
  setCookie(c, ADMIN_SESSION_COOKIE_NAME, '', {
    ...getAdminSessionCookieOptions(
      c.req.raw,
      c.env as { ADMIN_SESSION_COOKIE_SAMESITE_NONE?: string },
      {
        maxAge: 0,
      },
    ),
    expires: new Date(0),
  });
}
