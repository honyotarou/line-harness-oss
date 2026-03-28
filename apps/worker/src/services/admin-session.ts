import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12;
export const ADMIN_SESSION_COOKIE_NAME = 'lh_admin_session';

interface AdminSessionPayload {
  scope: 'admin';
  iat: number;
  exp: number;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function getAdminSessionCookieOptions(
  request: Request,
  overrides?: {
    maxAge?: number;
  },
) {
  const url = new URL(request.url);
  const isLocal = isLocalHostname(url.hostname);

  return {
    path: '/',
    httpOnly: true,
    sameSite: isLocal ? ('Lax' as const) : ('None' as const),
    secure: !isLocal,
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
  },
): Promise<string> {
  const iat = options?.issuedAt ?? Math.floor(Date.now() / 1000);
  const exp = iat + (options?.expiresInSeconds ?? DEFAULT_SESSION_TTL_SECONDS);
  const payload: AdminSessionPayload = {
    scope: 'admin',
    iat,
    exp,
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
    return {
      scope: 'admin',
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function isValidAdminAuthToken(secret: string, token: string): Promise<boolean> {
  const session = await verifyAdminSessionToken(secret, token);
  return Boolean(session);
}

export function readAdminSessionCookie(c: Context): string | null {
  return getCookie(c, ADMIN_SESSION_COOKIE_NAME) ?? null;
}

export function writeAdminSessionCookie(c: Context, token: string): void {
  setCookie(c, ADMIN_SESSION_COOKIE_NAME, token, getAdminSessionCookieOptions(c.req.raw));
}

export function clearAdminSessionCookie(c: Context): void {
  setCookie(c, ADMIN_SESSION_COOKIE_NAME, '', {
    ...getAdminSessionCookieOptions(c.req.raw, { maxAge: 0 }),
    expires: new Date(0),
  });
}
