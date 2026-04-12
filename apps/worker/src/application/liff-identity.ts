import type { LineAccountDbOptions } from '@line-crm/db';
import { getFriendByLineUserId } from '@line-crm/db';
import type { Env } from '../index.js';
import { verifyLineLoginIdToken } from '../services/line-login-id-token.js';

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isRequireLiffStateSecretEnabled(env: Env['Bindings']): boolean {
  return isTruthyEnvFlag(env.REQUIRE_LIFF_STATE_SECRET);
}

/**
 * Dedicated OAuth state secret when set; may still combine with `ALLOW_LIFF_OAUTH_API_KEY_FALLBACK`
 * via {@link resolveLiffOAuthStateSecret}.
 */
export function liffStateSecret(env: Env['Bindings']): string {
  const dedicated = env.LIFF_STATE_SECRET?.trim();
  if (dedicated) return dedicated;
  if (isTruthyEnvFlag(env.ALLOW_LIFF_OAUTH_API_KEY_FALLBACK)) {
    return env.API_KEY?.trim() ?? '';
  }
  return '';
}

/**
 * Secret for LINE Login OAuth `state` sign/verify. When `REQUIRE_LIFF_STATE_SECRET` is set,
 * only a non-empty `LIFF_STATE_SECRET` is allowed (no `API_KEY` fallback).
 * Otherwise `LIFF_STATE_SECRET` is preferred; `API_KEY` is used only when
 * `ALLOW_LIFF_OAUTH_API_KEY_FALLBACK` is enabled (local/dev convenience).
 */
export function resolveLiffOAuthStateSecret(env: Env['Bindings']): string | null {
  if (isRequireLiffStateSecretEnabled(env)) {
    const s = env.LIFF_STATE_SECRET?.trim();
    return s && s.length > 0 ? s : null;
  }
  const dedicated = env.LIFF_STATE_SECRET?.trim();
  if (dedicated) return dedicated;
  if (isTruthyEnvFlag(env.ALLOW_LIFF_OAUTH_API_KEY_FALLBACK)) {
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

export type LiffLineUserBody = { lineUserId: string; idToken: string };

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
