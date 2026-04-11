import { getFriendByLineUserId } from '@line-crm/db';
import type { Env } from '../index.js';
import { verifyLineLoginIdToken } from '../services/line-login-id-token.js';

export function liffStateSecret(env: Env['Bindings']): string {
  return env.LIFF_STATE_SECRET?.trim() || env.API_KEY;
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
): Promise<LiffVerifiedFriendOnlyResult> {
  const verified = await verifyLineLoginIdToken(db, loginChannelId, idToken);
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
): Promise<LiffFriendFromLineUserResult> {
  if (!raw.lineUserId || !raw.idToken) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'lineUserId and idToken are required' },
    };
  }
  return verifyLiffIdTokenAndLoadFriend(db, loginChannelId, raw.lineUserId, raw.idToken);
}

export function normalizeBookingFallbackTelUri(trimmed: string): string {
  return trimmed.startsWith('tel:') ? trimmed : `tel:${trimmed}`;
}
