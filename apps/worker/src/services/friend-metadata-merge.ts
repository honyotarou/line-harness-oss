/**
 * Safe merge for PUT /api/friends/:id/metadata — reject non-objects and prototype-pollution keys.
 */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export const FRIEND_METADATA_PATCH_MAX_KEYS = 200;
export const FRIEND_METADATA_PATCH_MAX_DEPTH = 8;
/** Total keys across the patch tree (top-level object keys + nested object keys). */
export const FRIEND_METADATA_PATCH_MAX_TOTAL_KEYS = 400;

export type FriendMetadataMergeResult =
  | { ok: true; merged: Record<string, unknown> }
  | { ok: false; status: 400; error: string };

function countPatchKeys(patch: Record<string, unknown>): number {
  let n = Object.keys(patch).length;
  for (const v of Object.values(patch)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      n += countPatchKeys(v as Record<string, unknown>);
    }
  }
  return n;
}

function walkPatchForForbidden(patch: Record<string, unknown>, depth: number): string | null {
  if (depth > FRIEND_METADATA_PATCH_MAX_DEPTH) {
    return 'metadata patch exceeds max nesting depth';
  }
  for (const [k, v] of Object.entries(patch)) {
    if (FORBIDDEN_KEYS.has(k)) {
      return 'metadata patch contains forbidden key';
    }
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const inner = walkPatchForForbidden(v as Record<string, unknown>, depth + 1);
      if (inner) {
        return inner;
      }
    }
  }
  return null;
}

export function mergeFriendMetadataPatch(
  existing: Record<string, unknown>,
  patch: unknown,
): FriendMetadataMergeResult {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, status: 400, error: 'metadata patch must be a JSON object' };
  }

  const raw = patch as Record<string, unknown>;

  const forbiddenErr = walkPatchForForbidden(raw, 0);
  if (forbiddenErr) {
    return { ok: false, status: 400, error: forbiddenErr };
  }

  const totalKeys = countPatchKeys(raw);
  if (totalKeys > FRIEND_METADATA_PATCH_MAX_TOTAL_KEYS) {
    return {
      ok: false,
      status: 400,
      error: `metadata patch cannot exceed ${FRIEND_METADATA_PATCH_MAX_TOTAL_KEYS} keys across nested objects`,
    };
  }

  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    safe[k] = v;
  }

  if (Object.keys(safe).length > FRIEND_METADATA_PATCH_MAX_KEYS) {
    return {
      ok: false,
      status: 400,
      error: `metadata patch cannot exceed ${FRIEND_METADATA_PATCH_MAX_KEYS} keys`,
    };
  }

  return { ok: true, merged: { ...existing, ...safe } };
}
