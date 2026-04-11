/**
 * Browser-safe defensive JSON helpers (admin UI / corrupt API payloads).
 */

export function tryParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function tryParseJsonLoose(raw: string | null | undefined): unknown | null {
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Plain object only; null for arrays, primitives, or invalid JSON. */
export function tryParseJsonRecord(raw: string | null | undefined): Record<string, unknown> | null {
  if (raw == null || raw === '') return null;
  try {
    const v = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
    return v as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Array only; [] for invalid or non-array. */
export function tryParseJsonArray(raw: string | null | undefined): unknown[] {
  if (raw == null || raw === '') return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Parse JSON for preview (flex/image); returns null if not a non-null object or invalid.
 * Use for UI that must not throw on poisoned message content.
 */
export function tryParseJsonObjectForPreview(raw: string): Record<string, unknown> | null {
  const v = tryParseJsonLoose(raw);
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}
