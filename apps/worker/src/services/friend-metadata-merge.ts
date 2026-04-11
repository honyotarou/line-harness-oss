/**
 * Safe merge for PUT /api/friends/:id/metadata — reject non-objects and prototype-pollution keys.
 */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export const FRIEND_METADATA_PATCH_MAX_KEYS = 200;

export type FriendMetadataMergeResult =
  | { ok: true; merged: Record<string, unknown> }
  | { ok: false; status: 400; error: string };

export function mergeFriendMetadataPatch(
  existing: Record<string, unknown>,
  patch: unknown,
): FriendMetadataMergeResult {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, status: 400, error: 'metadata patch must be a JSON object' };
  }

  const raw = patch as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
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
