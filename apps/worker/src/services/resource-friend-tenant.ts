export type TenantScoped = Readonly<{ line_account_id: string | null }>;

export type MultiTenantMode = Readonly<{ multi: boolean }>;

/**
 * Pure predicate: does a tenant-scoped resource (tag / scenario / tracked-link)
 * belong to the given friend's tenant under the current deployment mode?
 *
 * - Scoped resource (line_account_id set): friend's line_account_id must match.
 * - Global resource (line_account_id null):
 *     - single-tenant deployment: always safe
 *     - multi-tenant deployment: only safe when the friend is also global
 *
 * Why: inline duplicated checks across form-submission and tracked-link-redirect
 * drifted. A single predicate with explicit inputs makes the rule testable and
 * removes the chance for future call sites to forget a branch.
 */
export function resourceBelongsToFriendTenant(
  resource: TenantScoped,
  friend: TenantScoped,
  mode: MultiTenantMode,
): boolean {
  if (resource.line_account_id !== null) {
    return resource.line_account_id === friend.line_account_id;
  }
  if (!mode.multi) {
    return true;
  }
  return friend.line_account_id === null;
}
