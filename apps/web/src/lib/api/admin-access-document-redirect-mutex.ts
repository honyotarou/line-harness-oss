/**
 * Parallel dashboard `fetch` calls can all see the same Cloudflare Access 302. Only **one**
 * top-level `location.replace` may run; others must fail fast so the browser does not fire N
 * competing navigations (canceled fetches + reload storms).
 */

let adminAccessDocumentRedirectClaimed = false;

/** @returns true if this caller should perform `location.replace('/login')` */
export function tryClaimAdminAccessDocumentRedirect(): boolean {
  if (adminAccessDocumentRedirectClaimed) {
    return false;
  }
  adminAccessDocumentRedirectClaimed = true;
  return true;
}

/** Vitest: reset module state between cases (production relies on full page load). */
export function resetAdminAccessDocumentRedirectClaimForTests(): void {
  adminAccessDocumentRedirectClaimed = false;
}
