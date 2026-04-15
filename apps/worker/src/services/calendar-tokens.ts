import type { GoogleCalendarConnectionRow } from '@line-crm/db';

const PREFIX_ENC1 = 'enc1.';
const PREFIX_ENC2 = 'enc2.';

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(input: string): Uint8Array | null {
  try {
    const padded = input
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(input.length / 4) * 4, '=');
    const binary = atob(padded);
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Legacy: SHA-256(secret) → AES-256-GCM key (enc1.* ciphertexts). */
async function deriveAesGcmKeyEnc1(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** HKDF-SHA256(secret) → AES-256-GCM key (enc2.* ciphertexts; defense-in-depth vs raw SHA-256 KDF). */
async function deriveAesGcmKeyEnc2(secret: string): Promise<CryptoKey> {
  const ikm = new TextEncoder().encode(secret);
  const keyMaterial = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('line-harness-calendar-v2'),
      info: new TextEncoder().encode('calendar-token-aes-gcm'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptWithPrefix(
  plain: string,
  secret: string,
  prefix: typeof PREFIX_ENC1 | typeof PREFIX_ENC2,
  deriveKey: (s: string) => Promise<CryptoKey>,
): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return prefix + bytesToBase64Url(combined);
}

/**
 * Encrypt Google Calendar OAuth/API secrets at rest when `CALENDAR_TOKEN_ENCRYPTION_SECRET` is set.
 * New values use `enc2.` (HKDF-derived key). Legacy `enc1.` (SHA-256 KDF) still decrypts.
 */
export async function encryptCalendarTokenAtRest(
  plain: string | null | undefined,
  secret: string | undefined,
  options?: { requireSecret?: boolean },
): Promise<string | null> {
  if (plain == null || plain === '') return null;
  const s = secret?.trim();
  if (!s) {
    if (options?.requireSecret) {
      throw new Error(
        'CALENDAR_TOKEN_ENCRYPTION_SECRET is required when REQUIRE_CALENDAR_TOKEN_ENCRYPTION is enabled',
      );
    }
    return plain;
  }
  return encryptWithPrefix(plain, s, PREFIX_ENC2, deriveAesGcmKeyEnc2);
}

export async function decryptCalendarTokenAtRest(
  stored: string | null | undefined,
  secret: string | undefined,
): Promise<string | null> {
  if (stored == null || stored === '') return null;
  if (!stored.startsWith(PREFIX_ENC1) && !stored.startsWith(PREFIX_ENC2)) return stored;
  const s = secret?.trim();
  if (!s) return null;
  const isEnc1 = stored.startsWith(PREFIX_ENC1);
  const raw = base64UrlToBytes(stored.slice(isEnc1 ? PREFIX_ENC1.length : PREFIX_ENC2.length));
  if (!raw || raw.length < 12 + 16) return null;
  const iv = raw.subarray(0, 12);
  const ct = raw.subarray(12);
  try {
    const key = await (isEnc1 ? deriveAesGcmKeyEnc1(s) : deriveAesGcmKeyEnc2(s));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export async function decryptGoogleCalendarConnectionRow(
  row: GoogleCalendarConnectionRow,
  secret: string | undefined,
): Promise<GoogleCalendarConnectionRow> {
  const [access_token, refresh_token, api_key] = await Promise.all([
    decryptCalendarTokenAtRest(row.access_token, secret),
    decryptCalendarTokenAtRest(row.refresh_token, secret),
    decryptCalendarTokenAtRest(row.api_key, secret),
  ]);
  return {
    ...row,
    access_token,
    refresh_token,
    api_key,
  };
}
