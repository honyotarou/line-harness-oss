/**
 * Rejects path-segment values that could confuse URL construction or proxies
 * (`/`, `%`, `..`, etc.). Matches typical UUID / slug primary keys used in this codebase.
 */
const SAFE_PATH_SEGMENT_ID = /^[a-zA-Z0-9_-]{1,128}$/;

export function isSafePathSegmentResourceId(id: string): boolean {
  if (typeof id !== 'string' || id.length === 0) return false;
  if (!SAFE_PATH_SEGMENT_ID.test(id)) return false;
  if (id.includes('..')) return false;
  return true;
}
