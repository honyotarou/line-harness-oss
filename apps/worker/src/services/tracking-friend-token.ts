/**
 * HMAC-signed `f` query param for GET /t/:linkId — binds friendId to linkId and expiry
 * so anonymous clients cannot trigger tag/scenario side effects for arbitrary friends.
 */

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

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

export function trackingLinkSigningSecret(env: {
  TRACKING_LINK_SECRET?: string;
  API_KEY: string;
}): string {
  const s = env.TRACKING_LINK_SECRET?.trim();
  return s && s.length > 0 ? s : env.API_KEY;
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
  secret: string,
  linkId: string,
  token: string,
  options?: { now?: number },
): Promise<string | null> {
  const [encodedPayload, providedSignature, ...rest] = token.split('.');
  if (!encodedPayload || !providedSignature || rest.length > 0) {
    return null;
  }

  const expectedSignature = await signPayload(secret, encodedPayload);
  if (!constantTimeEqual(expectedSignature, providedSignature)) {
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
