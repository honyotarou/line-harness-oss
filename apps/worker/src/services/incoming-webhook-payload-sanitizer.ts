/**
 * Sanitize untrusted incoming webhook JSON bodies before passing them into automation/event-bus.
 * This mitigates "poisoning" style risks where downstream logic trusts the upstream payload too much.
 *
 * Policy: keep only JSON-safe primitives/arrays/objects within size/depth limits; drop dangerous keys.
 * This is not a schema validator for each partner — it is a safe default subset.
 */

const MAX_DEPTH = 8;
const MAX_KEYS_PER_OBJECT = 64;
const MAX_ARRAY_LEN = 128;
const MAX_STRING_LEN = 2_000;
const SAFE_KEY = /^[a-zA-Z0-9_.-]{1,64}$/;

function sanitize(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    return null;
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LEN) {
      return `${value.slice(0, MAX_STRING_LEN)}[truncated]`;
    }
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LEN).map((v) => sanitize(v, depth + 1));
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = Object.create(null);
    const keys = Object.keys(o).slice(0, MAX_KEYS_PER_OBJECT);
    for (const k of keys) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
        continue;
      }
      if (!SAFE_KEY.test(k)) {
        continue;
      }
      out[k] = sanitize(o[k], depth + 1);
    }
    return out;
  }
  return null;
}

export function sanitizeIncomingWebhookPayload(value: unknown): unknown {
  return sanitize(value, 0);
}
