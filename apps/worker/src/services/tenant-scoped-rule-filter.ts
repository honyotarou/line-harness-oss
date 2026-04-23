export type TenantScopedRule = Readonly<{ line_account_id: string | null }>;

/**
 * Fail-closed predicate for event-bus rules (automations / notifications /
 * outgoing webhooks) that may be either global or scoped to a LINE account.
 *
 * - Global rule (`line_account_id === null`): fires in any tenant context,
 *   including when the caller has no tenant context (broadcast-wide intent).
 * - Scoped rule (`line_account_id !== null`): fires **only** when the caller
 *   passes a matching `tenantLineAccountId`. An absent/null tenant context
 *   must NOT match a scoped rule — this is the fail-closed contract.
 *
 * Why: the prior inline filter (`!rule.line_account_id || !lineAccountId || ...`)
 * short-circuited to true when callers forgot to forward the tenant id,
 * letting one tenant's scoped rules fire on another tenant's event.
 */
export function tenantScopedRuleMatches(
  rule: TenantScopedRule,
  tenantLineAccountId: string | null | undefined,
): boolean {
  if (rule.line_account_id === null) {
    return true;
  }
  return rule.line_account_id === tenantLineAccountId;
}
