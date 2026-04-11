/**
 * Defensive JSON helpers for attacker-controlled or DB-corrupted strings.
 */

export function tryParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Object-shaped JSON for metadata / conditions; null if not a plain object or parse fails. */
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

/**
 * JSON array of strings (e.g. notification channels, webhook eventTypes).
 * Supports legacy double-encoded JSON. Returns null if invalid.
 */
export function parseStringArrayJson(raw: string): string[] | null {
  try {
    let v: unknown = JSON.parse(raw);
    if (typeof v === 'string') v = JSON.parse(v);
    if (!Array.isArray(v)) return null;
    if (!v.every((x) => typeof x === 'string')) return null;
    return v;
  } catch {
    return null;
  }
}

/** Parse any JSON value; null if empty or invalid. */
export function tryParseJsonLoose(raw: string | null | undefined): unknown | null {
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** JSON array for automation actions / form fields; [] if invalid or not an array. */
export function tryParseJsonArray(raw: string | null | undefined): unknown[] {
  if (raw == null || raw === '') return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
