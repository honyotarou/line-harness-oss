/**
 * HMAC-signed `f` query param for GET /t/:linkId — binds friendId to linkId and expiry
 * so anonymous clients cannot trigger tag/scenario side effects for arbitrary friends.
 */

import { effectiveRequireTrackingLinkDedicatedSecret } from './deployed-security-defaults.js';
import { timingSafeEqualUtf8 } from './timing-safe-equal.js';

/** Default validity for signed tracking URLs (personalized links). */
export const DEFAULT_TRACKED_LINK_TTL_SECONDS = 90 * 24 * 60 * 60;

interface TrackedLinkFriendPayload {
  scope: 'tracked_link_friend';
  lid: string;
  fid: string;
  iat: number;
  exp: number;
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

/**
 * HMAC secret for `?f=` tokens. Returns `null` when a dedicated secret is required but
 * `TRACKING_LINK_SECRET` is unset — issuance/verification must fail (no API_KEY fallback).
 */
export function trackingLinkHmacSecret(env: {
  TRACKING_LINK_SECRET?: string;
  API_KEY: string;
  REQUIRE_TRACKING_LINK_SECRET?: string;
  WORKER_URL?: string;
  RELAX_DEPLOYED_SECURITY_DEFAULTS?: string;
  /** `1`: allow `API_KEY` fallback for `?f=` signing on non-local HTTPS (insecure; dev migration only). */
  ALLOW_TRACKING_LINK_API_KEY_FALLBACK?: string;
}): string | null {
  const dedicated = env.TRACKING_LINK_SECRET?.trim();
  if (dedicated) {
    return dedicated;
  }
  if (effectiveRequireTrackingLinkDedicatedSecret(env)) {
    return null;
  }
  return env.API_KEY;
}

/** @deprecated use {@link trackingLinkHmacSecret} — kept for tests that expect API_KEY fallback. */
export function trackingLinkSigningSecret(env: {
  TRACKING_LINK_SECRET?: string;
  API_KEY: string;
  REQUIRE_TRACKING_LINK_SECRET?: string;
  WORKER_URL?: string;
  ALLOW_TRACKING_LINK_API_KEY_FALLBACK?: string;
  RELAX_DEPLOYED_SECURITY_DEFAULTS?: string;
}): string {
  return trackingLinkHmacSecret(env) ?? env.API_KEY;
}

export async function issueTrackedLinkFriendToken(
  secret: string,
  input: {
    linkId: string;
    friendId: string;
    expiresInSeconds?: number;
  },
  options?: { issuedAt?: number },
): Promise<string> {
  const iat = options?.issuedAt ?? Math.floor(Date.now() / 1000);
  const ttl = input.expiresInSeconds ?? DEFAULT_TRACKED_LINK_TTL_SECONDS;
  const exp = iat + ttl;
  const payload: TrackedLinkFriendPayload = {
    scope: 'tracked_link_friend',
    lid: input.linkId,
    fid: input.friendId,
    iat,
    exp,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await signPayload(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifyTrackedLinkFriendToken(
  secret: string | null,
  linkId: string,
  token: string,
  options?: { now?: number },
): Promise<string | null> {
  if (secret === null || secret === '') {
    return null;
  }
  const [encodedPayload, providedSignature, ...rest] = token.split('.');
  if (!encodedPayload || !providedSignature || rest.length > 0) {
    return null;
  }

  const expectedSignature = await signPayload(secret, encodedPayload);
  if (!(await timingSafeEqualUtf8(expectedSignature, providedSignature))) {
    return null;
  }

  try {
    const payload = JSON.parse(
      decodeBase64Url(encodedPayload),
    ) as Partial<TrackedLinkFriendPayload>;
    const now = options?.now ?? Math.floor(Date.now() / 1000);
    if (
      payload.scope !== 'tracked_link_friend' ||
      typeof payload.lid !== 'string' ||
      typeof payload.fid !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    if (payload.lid !== linkId || payload.exp <= now) {
      return null;
    }
    return payload.fid;
  } catch {
    return null;
  }
}
