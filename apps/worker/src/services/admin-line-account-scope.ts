import type { Context } from 'hono';
import { getLineAccounts, listPrincipalLineAccountIdsForEmail } from '@line-crm/db';
import type { Env } from '../index.js';
import {
  getCloudflareAccessEmailFromContext,
  isCloudflareAccessEnforced,
} from './cloudflare-access-principal.js';
import { lineAccountDbOptions } from './line-account-at-rest-key.js';

export type LineAccountScope = { mode: 'all' } | { mode: 'restricted'; ids: Set<string> };

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * When set, and the deployment has more than one active LINE account, every principal
 * is treated as "restricted" to the union of active account ids until they pass an
 * explicit `lineAccountId` on list endpoints (same validation as Zero Trust scoped admins).
 * Closes cross-account friend/broadcast enumeration with a single API_KEY.
 */
export async function resolveLineAccountScopeForRequest(
  db: D1Database,
  c: Context<Env>,
): Promise<LineAccountScope> {
  if (isCloudflareAccessEnforced(c.env)) {
    const email = getCloudflareAccessEmailFromContext(c);
    if (email) {
      const ids = await listPrincipalLineAccountIdsForEmail(db, email);
      if (ids.length > 0) {
        return { mode: 'restricted', ids: new Set(ids) };
      }
    }
  }

  if (isTruthyEnvFlag(c.env.MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID)) {
    const accounts = await getLineAccounts(db, lineAccountDbOptions(c.env));
    const activeIds = accounts.filter((a) => Boolean(a.is_active)).map((a) => a.id);
    if (activeIds.length > 1) {
      return { mode: 'restricted', ids: new Set(activeIds) };
    }
  }

  return { mode: 'all' };
}

export type ScopedLineAccountQueryResult =
  | { ok: true }
  | { ok: false; status: 400 | 403; error: string };

/** Validates `lineAccountId` query param when the principal has LINE account restrictions. */
export function validateScopedLineAccountQueryParam(
  scope: LineAccountScope,
  lineAccountId: string | undefined | null,
): ScopedLineAccountQueryResult {
  if (scope.mode === 'all') {
    return { ok: true };
  }
  const q = lineAccountId?.trim();
  if (!q) {
    return {
      ok: false,
      status: 400,
      error: 'lineAccountId query parameter is required for this principal',
    };
  }
  if (!scope.ids.has(q)) {
    return {
      ok: false,
      status: 403,
      error: 'Forbidden: LINE account not allowed for this principal',
    };
  }
  return { ok: true };
}

/** Single-resource check: friend row, broadcast row, etc. */
export function resourceLineAccountVisibleInScope(
  scope: LineAccountScope,
  resourceLineAccountId: string | null | undefined,
): boolean {
  if (scope.mode === 'all') {
    return true;
  }
  const id = resourceLineAccountId?.trim();
  if (!id) {
    return false;
  }
  return scope.ids.has(id);
}

export type BodyLineAccountResult =
  | { ok: true; lineAccountId: string | null }
  | { ok: false; status: 400 | 403; error: string };

/**
 * For POST create: restricted principals must send `lineAccountId` and it must be allowed.
 * Unrestricted may omit (null).
 */
export function validateScopedLineAccountBody(
  scope: LineAccountScope,
  bodyLineAccountId: string | null | undefined,
): BodyLineAccountResult {
  if (scope.mode === 'all') {
    const v = bodyLineAccountId?.trim();
    return { ok: true, lineAccountId: v && v.length > 0 ? v : null };
  }
  const q = bodyLineAccountId?.trim();
  if (!q) {
    return {
      ok: false,
      status: 400,
      error: 'lineAccountId is required for this principal',
    };
  }
  if (!scope.ids.has(q)) {
    return {
      ok: false,
      status: 403,
      error: 'Forbidden: LINE account not allowed for this principal',
    };
  }
  return { ok: true, lineAccountId: q };
}

const LINE_ACCOUNT_WRITE_FORBIDDEN_ERROR =
  'Forbidden: mutating LINE accounts requires an unrestricted admin principal';

/**
 * POST/PUT/DELETE on LINE accounts are owner-equivalent: only `scope.mode === 'all'`
 * (no Cloudflare line-account restriction, no multi-account restricted API_KEY mode).
 * Scoped principals may list/read accounts visible to them only.
 */
export function lineAccountWriteForbiddenForScope(
  scope: LineAccountScope,
): { forbidden: true; error: string } | { forbidden: false } {
  if (scope.mode === 'all') {
    return { forbidden: false };
  }
  return { forbidden: true, error: LINE_ACCOUNT_WRITE_FORBIDDEN_ERROR };
}
