import { getValidatedAccessEmailFromPayload } from './cloudflare-access-principal.js';

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function decodeJsonB64url(part: string): unknown {
  const bytes = base64UrlToBytes(part);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as unknown;
}

function jwtAudienceMatchesClaim(aud: unknown, expected: string): boolean {
  if (typeof aud === 'string') return aud === expected;
  if (Array.isArray(aud)) return aud.some((x) => typeof x === 'string' && x === expected);
  return false;
}

export type VerifyCloudflareAccessJwtInput = {
  jwt: string;
  teamDomain: string;
  /** Optional comma-separated emails (case-insensitive). When set, resolved principal email must match. */
  allowedEmails?: string | undefined;
  /** When set, JWT `aud` must equal this string (or include it when `aud` is an array). */
  expectedAudience?: string | undefined;
  fetchFn?: typeof fetch;
};

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
/** Reject absurd JWKS payloads (cache-poisoning / DoS hardening). */
const JWKS_MAX_KEYS = 48;
let jwksCache: { domain: string; keys: Array<Record<string, unknown>>; fetchedAt: number } | null =
  null;

/** Test helper: reset in-memory JWKS cache. */
export function resetCloudflareAccessJwksCacheForTests(): void {
  jwksCache = null;
}

export type VerifyCloudflareAccessJwtResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: string };

interface CfCertsResponse {
  keys?: Array<Record<string, unknown>>;
}

/**
 * Verifies the `Cf-Access-Jwt-Assertion` header using Cloudflare Access JWKS
 * (`https://<team-domain>/cdn-cgi/access/certs`).
 *
 * @see https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookies/validating-json/
 */
export async function verifyCloudflareAccessJwt(
  input: VerifyCloudflareAccessJwtInput,
): Promise<VerifyCloudflareAccessJwtResult> {
  const jwt = input.jwt.trim();
  if (!jwt) {
    return { ok: false, reason: 'Missing Cloudflare Access JWT' };
  }

  const parts = jwt.split('.');
  if (parts.length !== 3) {
    return { ok: false, reason: 'Malformed JWT' };
  }

  const [headerB64, payloadB64] = parts;
  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = decodeJsonB64url(headerB64) as { alg?: string; kid?: string };
    payload = decodeJsonB64url(payloadB64) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'Invalid JWT encoding' };
  }

  if (header.alg !== 'RS256' || !header.kid) {
    return { ok: false, reason: 'Unsupported JWT header' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  if (exp !== null && nowSec >= exp) {
    return { ok: false, reason: 'JWT expired' };
  }

  const iss = typeof payload.iss === 'string' ? payload.iss : '';
  const expectedIss = `https://${input.teamDomain.replace(/\/+$/, '')}`;
  if (iss !== expectedIss) {
    return { ok: false, reason: 'Invalid JWT issuer' };
  }

  const allowed = input.allowedEmails?.trim();
  if (allowed) {
    const set = new Set(
      allowed
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    const principalEmail = getValidatedAccessEmailFromPayload(payload);
    if (!principalEmail || !set.has(principalEmail)) {
      return { ok: false, reason: 'Email not allowed for Cloudflare Access' };
    }
  }

  const domainNorm = input.teamDomain.replace(/\/+$/, '');
  const fetchImpl = input.fetchFn ?? fetch;
  const certsUrl = `https://${domainNorm}/cdn-cgi/access/certs`;

  let keys: Array<Record<string, unknown>>;
  const now = Date.now();
  if (
    jwksCache &&
    jwksCache.domain === domainNorm &&
    now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS
  ) {
    keys = jwksCache.keys;
  } else {
    let certsRes: Response;
    try {
      // Never follow redirects: a malicious or misconfigured endpoint could otherwise
      // serve attacker-controlled JWKS that we would cache under the trusted team domain.
      certsRes = await fetchImpl(certsUrl, { redirect: 'error' });
    } catch {
      return { ok: false, reason: 'Failed to fetch Cloudflare Access certs' };
    }

    if (!certsRes.ok) {
      return { ok: false, reason: 'Cloudflare Access certs request failed' };
    }

    const resolvedUrl = certsRes.url || certsUrl;
    let resolvedHost: string;
    try {
      resolvedHost = new URL(resolvedUrl).hostname.toLowerCase();
    } catch {
      return { ok: false, reason: 'Invalid Cloudflare Access certs URL' };
    }
    if (resolvedHost !== domainNorm.toLowerCase()) {
      return { ok: false, reason: 'Cloudflare Access certs hostname mismatch' };
    }

    const ct = certsRes.headers.get('content-type')?.toLowerCase() ?? '';
    if (!ct.includes('application/json')) {
      return { ok: false, reason: 'Cloudflare Access certs must be JSON' };
    }

    let certsJson: CfCertsResponse;
    try {
      certsJson = (await certsRes.json()) as CfCertsResponse;
    } catch {
      return { ok: false, reason: 'Invalid Cloudflare Access certs JSON' };
    }

    keys = Array.isArray(certsJson.keys) ? certsJson.keys : [];
    if (keys.length > JWKS_MAX_KEYS) {
      return { ok: false, reason: 'Cloudflare Access JWKS too large' };
    }
    jwksCache = { domain: domainNorm, keys, fetchedAt: now };
  }
  const jwk = keys.find((k) => k && typeof k === 'object' && k.kid === header.kid) as
    | (JsonWebKey & { kid: string })
    | undefined;

  if (!jwk || jwk.kty !== 'RSA') {
    return { ok: false, reason: 'Signing key not found in JWKS' };
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  } catch {
    return { ok: false, reason: 'Invalid JWK from Cloudflare Access' };
  }

  const signature = base64UrlToBytes(parts[2]);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, cryptoKey, signature, data);
  } catch {
    return { ok: false, reason: 'JWT signature verification error' };
  }

  if (!valid) {
    return { ok: false, reason: 'Invalid JWT signature' };
  }

  const audExpect = input.expectedAudience?.trim();
  if (audExpect && !jwtAudienceMatchesClaim(payload.aud, audExpect)) {
    return { ok: false, reason: 'Invalid JWT audience' };
  }

  return { ok: true, payload };
}
