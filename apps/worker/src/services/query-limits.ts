/** Parse query number after trim; empty/whitespace-only string is invalid (NaN). */
function numericFromOptionalQuery(raw: string | undefined, whenUndefined: number): number {
  if (raw === undefined) return whenUndefined;
  const t = raw.trim();
  if (t === '') return Number.NaN;
  return Number(t);
}

/** Clamp list `limit` query params to reduce DoS / accidental huge reads. */
export function clampListLimit(raw: string | undefined, fallback: number, max: number): number {
  const n = numericFromOptionalQuery(raw, fallback);
  if (!Number.isFinite(n)) return Math.min(fallback, max);
  const i = Math.floor(n);
  if (i < 1) return Math.min(fallback, max);
  return Math.min(i, max);
}

/** Clamp pagination offset (non-negative, capped). */
export function clampOffset(raw: string | undefined, max: number): number {
  const n = numericFromOptionalQuery(raw, 0);
  if (!Number.isFinite(n)) return 0;
  const i = Math.floor(n);
  if (i < 0) return 0;
  return Math.min(i, max);
}

/** Integer in [min, max] inclusive; invalid numbers use clamped fallback. */
export function clampIntInRange(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = numericFromOptionalQuery(raw, fallback);
  if (!Number.isFinite(n)) {
    return Math.min(Math.max(fallback, min), max);
  }
  return Math.min(Math.max(Math.floor(n), min), max);
}
