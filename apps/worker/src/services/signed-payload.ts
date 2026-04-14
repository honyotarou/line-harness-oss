async function computeHexHmac(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time comparison for hex HMAC strings (mitigate timing leaks). */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    const ca = a.charCodeAt(i);
    const cb = b.charCodeAt(i);
    const na = ca >= 65 && ca <= 70 ? ca + 32 : ca;
    const nb = cb >= 65 && cb <= 70 ? cb + 32 : cb;
    diff |= na ^ nb;
  }
  return diff === 0;
}

export function buildTimestampedSignedPayload(timestamp: string, payload: string): string {
  return `${timestamp}.${payload}`;
}

function isAsciiDigits(s: string): boolean {
  return /^[0-9]+$/.test(s);
}

export async function verifySignedPayload(
  secret: string,
  payload: string,
  providedSignature: string,
  options?: {
    timestamp?: string;
    /** Reject replays older than this (seconds). When unset, no replay window check. */
    maxAgeSec?: number;
    nowMs?: number;
    /** When true, missing/invalid timestamp fails verification. */
    requireTimestamp?: boolean;
  },
): Promise<boolean> {
  if (!providedSignature) {
    return false;
  }

  const ts = options?.timestamp;
  const requireTs = options?.requireTimestamp === true;
  if (ts !== undefined) {
    const t = ts.trim();
    if (!isAsciiDigits(t)) {
      return false;
    }
    const maxAgeSec = options?.maxAgeSec;
    if (maxAgeSec !== undefined) {
      const nowMs = options?.nowMs ?? Date.now();
      const tsMs = Number(t) * 1000;
      if (!Number.isFinite(tsMs)) {
        return false;
      }
      const ageMs = Math.abs(nowMs - tsMs);
      if (ageMs > maxAgeSec * 1000) {
        return false;
      }
    }
    const message = buildTimestampedSignedPayload(t, payload);
    const expectedSignature = await computeHexHmac(secret, message);
    return constantTimeEqualHex(providedSignature, expectedSignature);
  }

  if (requireTs) {
    return false;
  }

  // Legacy mode (no timestamp).
  const expectedSignature = await computeHexHmac(secret, payload);
  return constantTimeEqualHex(providedSignature, expectedSignature);
}
