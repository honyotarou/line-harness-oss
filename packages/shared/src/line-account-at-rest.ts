/**
 * Optional AES-256-GCM envelope for LINE account secrets stored in D1.
 * Prefix distinguishes ciphertext from legacy plaintext rows.
 */
export const LINE_ACCOUNT_AT_REST_PREFIX = 'lh1:';

function decodeBase64KeyMaterial(t: string): Uint8Array | undefined {
  const s = t.trim();
  if (!s) return undefined;
  const normalized = s.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const bin = atob(normalized);
    if (bin.length !== 32) return undefined;
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return undefined;
  }
}

/** Parse `LINE_ACCOUNT_SECRETS_KEY` (32 raw bytes as standard base64, with or without padding). */
export function parseLineAccountSecretsKey(raw: string | undefined): Uint8Array | undefined {
  return decodeBase64KeyMaterial(raw ?? '');
}

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

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sealLineAccountSecretField(plain: string, key: Uint8Array): Promise<string> {
  const keyCopy = Uint8Array.from(key);
  const iv = Uint8Array.from(crypto.getRandomValues(new Uint8Array(12)));
  const algo = { name: 'AES-GCM' as const, iv, tagLength: 128 };
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyCopy,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const pt = new TextEncoder().encode(plain);
  const ct = new Uint8Array(await crypto.subtle.encrypt(algo, cryptoKey, pt));
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv, 0);
  combined.set(ct, iv.length);
  return LINE_ACCOUNT_AT_REST_PREFIX + bytesToBase64Url(combined);
}

export async function unsealLineAccountSecretField(
  stored: string,
  key: Uint8Array,
): Promise<string> {
  if (!stored.startsWith(LINE_ACCOUNT_AT_REST_PREFIX)) {
    return stored;
  }
  const raw = stored.slice(LINE_ACCOUNT_AT_REST_PREFIX.length);
  let combined: Uint8Array;
  try {
    combined = base64UrlToBytes(raw);
  } catch {
    throw new Error('Corrupt sealed LINE account secret');
  }
  if (combined.length < 12 + 16) {
    throw new Error('Corrupt sealed LINE account secret');
  }
  const keyCopy = Uint8Array.from(key);
  const iv = Uint8Array.from(combined.subarray(0, 12));
  const ciphertext = Uint8Array.from(combined.subarray(12));
  const algo = { name: 'AES-GCM' as const, iv, tagLength: 128 };
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyCopy,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  try {
    const pt = await crypto.subtle.decrypt(algo, cryptoKey, ciphertext);
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error('LINE_ACCOUNT_SECRETS_KEY cannot decrypt stored LINE account secret');
  }
}
