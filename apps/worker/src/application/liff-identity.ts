import type { LineAccountDbOptions } from '@line-crm/db';
import { getFriendByLineUserId } from '@line-crm/db';
import type { Env } from '../index.js';
import {
  effectiveRequireLiffStateSecret,
  explicitLiffOAuthApiKeyFallbackEnabled,
} from '../services/deployed-security-defaults.js';
import {
  lineLoginChannelMatchesFriendLineAccount,
  verifyLineLoginIdToken,
} from '../services/line-login-id-token.js';

export function isRequireLiffStateSecretEnabled(env: Env['Bindings']): boolean {
  return effectiveRequireLiffStateSecret(env);
}

/**
 * Dedicated OAuth state secret when set; may still combine with `ALLOW_LIFF_OAUTH_API_KEY_FALLBACK`
 * via {@link resolveLiffOAuthStateSecret}.
 */
export function liffStateSecret(env: Env['Bindings']): string {
  const dedicated = env.LIFF_STATE_SECRET?.trim();
  if (dedicated) return dedicated;
  if (explicitLiffOAuthApiKeyFallbackEnabled(env)) {
    return env.API_KEY?.trim() ?? '';
  }
  return '';
}

/**
 * Secret for LINE Login OAuth `state` sign/verify. When dedicated state is required
 * (`REQUIRE_LIFF_STATE_SECRET` or non-local HTTPS defaults), only a non-empty `LIFF_STATE_SECRET`
 * is allowed (no `API_KEY` fallback). Otherwise `LIFF_STATE_SECRET` is preferred; `API_KEY` is
 * used only when `ALLOW_LIFF_OAUTH_API_KEY_FALLBACK` is enabled (local/dev convenience).
 * `RELAX_DEPLOYED_SECURITY_*` alone does not waive the HTTPS LIFF state secret requirement.
 */
export function resolveLiffOAuthStateSecret(env: Env['Bindings']): string | null {
  if (isRequireLiffStateSecretEnabled(env)) {
    const s = env.LIFF_STATE_SECRET?.trim();
    return s && s.length > 0 ? s : null;
  }
  const dedicated = env.LIFF_STATE_SECRET?.trim();
  if (dedicated) return dedicated;
  if (explicitLiffOAuthApiKeyFallbackEnabled(env)) {
    const api = env.API_KEY?.trim();
    return api && api.length > 0 ? api : null;
  }
  return null;
}

export function emailsMatchForRecovery(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export const BOOKING_PHONE_FALLBACK_MESSAGE =
  'オンラインで予約を完了できない場合は、お電話にてご連絡ください。';

export type LiffLineUserBody = Readonly<{ lineUserId: string; idToken: string }>;

export type LiffFriendFromLineUserResult =
  | { ok: true; friend: NonNullable<Awaited<ReturnType<typeof getFriendByLineUserId>>> }
  | { ok: false; status: 400 | 401 | 404; body: { success: false; error: string } };

export type LiffVerifiedFriendOnlyResult =
  | { ok: true; friend: NonNullable<Awaited<ReturnType<typeof getFriendByLineUserId>>> }
  | { ok: false; status: 401 | 404; body: { success: false; error: string } };

export async function verifyLiffIdTokenAndLoadFriend(
  db: D1Database,
  loginChannelId: string,
  lineUserId: string,
  idToken: string,
  lineAccountOpts?: LineAccountDbOptions,
): Promise<LiffVerifiedFriendOnlyResult> {
  const verified = await verifyLineLoginIdToken(db, loginChannelId, idToken, lineAccountOpts);
  if (!verified || verified.sub !== lineUserId) {
    return { ok: false, status: 401, body: { success: false, error: 'Invalid ID token' } };
  }
  const friend = await getFriendByLineUserId(db, lineUserId);
  if (!friend) {
    return { ok: false, status: 404, body: { success: false, error: 'Friend not found' } };
  }
  if (
    !(await lineLoginChannelMatchesFriendLineAccount(
      db,
      verified.loginChannelId,
      friend,
      lineAccountOpts,
    ))
  ) {
    return { ok: false, status: 401, body: { success: false, error: 'Invalid ID token' } };
  }
  return { ok: true, friend };
}

export async function resolveLiffFriendFromLineUserBody(
  db: D1Database,
  loginChannelId: string,
  raw: LiffLineUserBody,
  lineAccountOpts?: LineAccountDbOptions,
): Promise<LiffFriendFromLineUserResult> {
  if (!raw.lineUserId || !raw.idToken) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'lineUserId and idToken are required' },
    };
  }
  return verifyLiffIdTokenAndLoadFriend(
    db,
    loginChannelId,
    raw.lineUserId,
    raw.idToken,
    lineAccountOpts,
  );
}

export function normalizeBookingFallbackTelUri(trimmed: string): string {
  return trimmed.startsWith('tel:') ? trimmed : `tel:${trimmed}`;
}
