/**
 * Escape HTML-sensitive characters in API JSON string leaves so admin/LIFF clients that
 * interpolate into HTML are less likely to execute stored markup (defense in depth).
 */
const MAX_DEPTH = 14;

export function escapeHtmlTextForJsonApi(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function deepEscapeHtmlStringLeaves(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return null;
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return escapeHtmlTextForJsonApi(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepEscapeHtmlStringLeaves(v, depth + 1));
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = Object.create(null);
    for (const k of Object.keys(o)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
        continue;
      }
      out[k] = deepEscapeHtmlStringLeaves(o[k], depth + 1);
    }
    return out;
  }
  return value;
}
