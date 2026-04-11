import type { GoogleCalendarConnectionRow } from '@line-crm/db';

const PREFIX = 'enc1.';

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

async function deriveAesGcmKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Encrypt Google Calendar OAuth/API secrets at rest when `CALENDAR_TOKEN_ENCRYPTION_SECRET` is set.
 * Values without the `enc1.` prefix are treated as legacy plaintext on read.
 */
export async function encryptCalendarTokenAtRest(
  plain: string | null | undefined,
  secret: string | undefined,
): Promise<string | null> {
  if (plain == null || plain === '') return null;
  const s = secret?.trim();
  if (!s) return plain;
  const key = await deriveAesGcmKey(s);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return PREFIX + bytesToBase64Url(combined);
}

export async function decryptCalendarTokenAtRest(
  stored: string | null | undefined,
  secret: string | undefined,
): Promise<string | null> {
  if (stored == null || stored === '') return null;
  if (!stored.startsWith(PREFIX)) return stored;
  const s = secret?.trim();
  if (!s) return null;
  const raw = base64UrlToBytes(stored.slice(PREFIX.length));
  if (!raw || raw.length < 12 + 16) return null;
  const iv = raw.subarray(0, 12);
  const ct = raw.subarray(12);
  try {
    const key = await deriveAesGcmKey(s);
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
