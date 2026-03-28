/**
 * Signed LINE Login OAuth `state` — prevents tampering with redirect, uid, ref, etc.
 * Secret: `LIFF_STATE_SECRET` if set, else `API_KEY`.
 */

export type LiffOAuthStateFields = {
  ref: string;
  redirect: string;
  gclid: string;
  fbclid: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  account: string;
  uid: string;
};

type LiffOAuthStatePayload = LiffOAuthStateFields & { iat: number; exp: number };

const STATE_TTL_SEC = 60 * 60;

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return new Uint8Array(buf);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function signLiffOAuthState(
  fields: LiffOAuthStateFields,
  secret: string,
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const payload: LiffOAuthStatePayload = {
    ...fields,
    iat,
    exp: iat + STATE_TTL_SEC,
  };
  const payloadJson = JSON.stringify(payload);
  const sig = await hmacSha256(secret, payloadJson);
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(payloadJson));
  const sigB64 = base64UrlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

export async function verifyLiffOAuthState(
  token: string,
  secret: string,
): Promise<LiffOAuthStateFields | null> {
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let payloadJson: string;
  try {
    payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
  } catch {
    return null;
  }

  const expectedSig = await hmacSha256(secret, payloadJson);
  let providedSig: Uint8Array;
  try {
    providedSig = base64UrlDecode(sigB64);
  } catch {
    return null;
  }
  if (!timingSafeEqual(providedSig, expectedSig)) return null;

  let parsed: LiffOAuthStatePayload;
  try {
    parsed = JSON.parse(payloadJson) as LiffOAuthStatePayload;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof parsed.exp !== 'number' || now > parsed.exp) return null;

  return {
    ref: typeof parsed.ref === 'string' ? parsed.ref : '',
    redirect: typeof parsed.redirect === 'string' ? parsed.redirect : '',
    gclid: typeof parsed.gclid === 'string' ? parsed.gclid : '',
    fbclid: typeof parsed.fbclid === 'string' ? parsed.fbclid : '',
    utmSource: typeof parsed.utmSource === 'string' ? parsed.utmSource : '',
    utmMedium: typeof parsed.utmMedium === 'string' ? parsed.utmMedium : '',
    utmCampaign: typeof parsed.utmCampaign === 'string' ? parsed.utmCampaign : '',
    utmContent: typeof parsed.utmContent === 'string' ? parsed.utmContent : '',
    utmTerm: typeof parsed.utmTerm === 'string' ? parsed.utmTerm : '',
    account: typeof parsed.account === 'string' ? parsed.account : '',
    uid: typeof parsed.uid === 'string' ? parsed.uid : '',
  };
}
