import {
  createUser,
  getEntryRouteByRefCode,
  getFriendByLineUserId,
  getUserByEmailCaseInsensitive,
  getUserById,
  linkFriendToUser,
  recordRefTracking,
} from '@line-crm/db';
import type { Env } from '../index.js';
import { assertHttpsOutboundUrlResolvedSafe } from '../services/outbound-url-resolve.js';
import { resolveSafeRedirectUrl, type LiffRedirectEnv } from '../services/liff-redirect.js';
import { verifyLineLoginIdToken } from '../services/line-login-id-token.js';
import {
  BOOKING_PHONE_FALLBACK_MESSAGE,
  emailsMatchForRecovery,
  normalizeBookingFallbackTelUri,
  resolveLiffFriendFromLineUserBody,
  verifyLiffIdTokenAndLoadFriend,
  type LiffLineUserBody,
} from './liff-identity.js';

/** Matches Hono `c.json` status typing (avoid widening to `number`). */
export type LiffJsonStatus = 200 | 400 | 401 | 404 | 500 | 503;

export type LiffJsonResult = { status: LiffJsonStatus; body: Record<string, unknown> };

export async function liffProfilePost(
  db: D1Database,
  loginChannelId: string,
  body: LiffLineUserBody,
): Promise<LiffJsonResult> {
  const resolved = await resolveLiffFriendFromLineUserBody(db, loginChannelId, body);
  if (!resolved.ok) {
    return { status: resolved.status, body: resolved.body as Record<string, unknown> };
  }
  const { friend } = resolved;
  return {
    status: 200,
    body: {
      success: true,
      data: {
        id: friend.id,
        displayName: friend.display_name,
        isFollowing: Boolean(friend.is_following),
        userId: (friend as unknown as Record<string, unknown>).user_id ?? null,
      },
    },
  };
}

export async function liffBookingPhoneFallbackPost(
  db: D1Database,
  loginChannelId: string,
  bookingFallbackTel: string | undefined,
  body: LiffLineUserBody,
): Promise<LiffJsonResult> {
  if (!body.lineUserId || !body.idToken) {
    return {
      status: 400,
      body: { success: false, error: 'lineUserId and idToken are required' },
    };
  }

  const telRaw = bookingFallbackTel?.trim();
  if (!telRaw) {
    return {
      status: 503,
      body: { success: false, error: 'Booking phone fallback is not configured' },
    };
  }
  const telUri = normalizeBookingFallbackTelUri(telRaw);

  const resolved = await verifyLiffIdTokenAndLoadFriend(
    db,
    loginChannelId,
    body.lineUserId,
    body.idToken,
  );
  if (!resolved.ok) {
    return { status: resolved.status, body: resolved.body as Record<string, unknown> };
  }

  return {
    status: 200,
    body: {
      success: true,
      data: {
        telUri,
        message: BOOKING_PHONE_FALLBACK_MESSAGE,
      },
    },
  };
}

export type LiffLinkBody = {
  idToken: string;
  displayName?: string | null;
  ref?: string;
  existingUuid?: string;
};

export async function liffLinkPost(
  db: D1Database,
  loginChannelId: string,
  body: LiffLinkBody,
): Promise<LiffJsonResult> {
  if (!body.idToken) {
    return { status: 400, body: { success: false, error: 'idToken is required' } };
  }

  const verified = await verifyLineLoginIdToken(db, loginChannelId, body.idToken);
  if (!verified) {
    return { status: 401, body: { success: false, error: 'Invalid ID token' } };
  }
  const lineUserId = verified.sub;
  const email = verified.email || null;

  const friend = await getFriendByLineUserId(db, lineUserId);
  if (!friend) {
    return { status: 404, body: { success: false, error: 'Friend not found' } };
  }

  if ((friend as unknown as Record<string, unknown>).user_id) {
    if (body.ref) {
      await db
        .prepare('UPDATE friends SET ref_code = ? WHERE id = ? AND ref_code IS NULL')
        .bind(body.ref, friend.id)
        .run();
    }
    return {
      status: 200,
      body: {
        success: true,
        data: {
          userId: (friend as unknown as Record<string, unknown>).user_id,
          alreadyLinked: true,
        },
      },
    };
  }

  let userId: string | null = null;
  if (email) {
    const existingUser = await getUserByEmailCaseInsensitive(db, email);
    if (existingUser) userId = existingUser.id;
  }

  const savedUuid = typeof body.existingUuid === 'string' ? body.existingUuid.trim() : '';
  if (!userId && savedUuid && email) {
    const savedUser = await getUserById(db, savedUuid);
    if (savedUser && emailsMatchForRecovery(savedUser.email, email)) {
      userId = savedUser.id;
    }
  }

  if (!userId) {
    const newUser = await createUser(db, {
      email,
      displayName: body.displayName || verified.name,
    });
    userId = newUser.id;
  }

  await linkFriendToUser(db, friend.id, userId);

  if (body.ref) {
    await db
      .prepare('UPDATE friends SET ref_code = ? WHERE id = ? AND ref_code IS NULL')
      .bind(body.ref, friend.id)
      .run();

    try {
      const route = await getEntryRouteByRefCode(db, body.ref);
      await recordRefTracking(db, {
        refCode: body.ref,
        friendId: friend.id,
        entryRouteId: route?.id ?? null,
        sourceUrl: null,
      });
    } catch {
      /* silent */
    }
  }

  return {
    status: 200,
    body: { success: true, data: { userId, alreadyLinked: false } },
  };
}

export async function liffAnalyticsRefSummary(
  db: D1Database,
  lineAccountId: string | undefined,
): Promise<LiffJsonResult> {
  const accountFilter = lineAccountId ? 'AND f.line_account_id = ?' : '';
  const accountBinds = lineAccountId ? [lineAccountId] : [];

  const rows = await db
    .prepare(
      `SELECT
          er.ref_code,
          er.name,
          COUNT(DISTINCT rt.friend_id) as friend_count,
          COUNT(rt.id) as click_count,
          MAX(rt.created_at) as latest_at
        FROM entry_routes er
        LEFT JOIN ref_tracking rt ON er.ref_code = rt.ref_code
        LEFT JOIN friends f ON f.id = rt.friend_id ${accountFilter ? `${accountFilter}` : ''}
        GROUP BY er.ref_code, er.name
        ORDER BY friend_count DESC`,
    )
    .bind(...accountBinds)
    .all<{
      ref_code: string;
      name: string;
      friend_count: number;
      click_count: number;
      latest_at: string | null;
    }>();

  const totalStmt = lineAccountId
    ? db
        .prepare(`SELECT COUNT(*) as count FROM friends WHERE line_account_id = ?`)
        .bind(lineAccountId)
    : db.prepare(`SELECT COUNT(*) as count FROM friends`);
  const totalFriendsRes = await totalStmt.first<{ count: number }>();

  const refStmt = lineAccountId
    ? db
        .prepare(
          `SELECT COUNT(*) as count FROM friends WHERE ref_code IS NOT NULL AND ref_code != '' AND line_account_id = ?`,
        )
        .bind(lineAccountId)
    : db.prepare(
        `SELECT COUNT(*) as count FROM friends WHERE ref_code IS NOT NULL AND ref_code != ''`,
      );
  const friendsWithRefRes = await refStmt.first<{ count: number }>();

  const totalFriends = totalFriendsRes?.count ?? 0;
  const friendsWithRef = friendsWithRefRes?.count ?? 0;

  return {
    status: 200,
    body: {
      success: true,
      data: {
        routes: (rows.results ?? []).map((r) => ({
          refCode: r.ref_code,
          name: r.name,
          friendCount: r.friend_count,
          clickCount: r.click_count,
          latestAt: r.latest_at,
        })),
        totalFriends,
        friendsWithRef,
        friendsWithoutRef: totalFriends - friendsWithRef,
      },
    },
  };
}

export async function liffAnalyticsRefDetail(
  db: D1Database,
  refCode: string,
  lineAccountId: string | undefined,
): Promise<LiffJsonResult> {
  const routeRow = await db
    .prepare(`SELECT ref_code, name FROM entry_routes WHERE ref_code = ?`)
    .bind(refCode)
    .first<{ ref_code: string; name: string }>();

  if (!routeRow) {
    return { status: 404, body: { success: false, error: 'Entry route not found' } };
  }

  const accountFilter = lineAccountId ? 'AND f.line_account_id = ?' : '';
  const binds = lineAccountId ? [refCode, refCode, lineAccountId] : [refCode, refCode];

  const friends = await db
    .prepare(
      `SELECT
          f.id,
          f.display_name,
          f.ref_code,
          rt.created_at as tracked_at
        FROM friends f
        LEFT JOIN ref_tracking rt ON f.id = rt.friend_id AND rt.ref_code = ?
        WHERE f.ref_code = ? ${accountFilter}
        ORDER BY rt.created_at DESC`,
    )
    .bind(...binds)
    .all<{
      id: string;
      display_name: string;
      ref_code: string | null;
      tracked_at: string | null;
    }>();

  return {
    status: 200,
    body: {
      success: true,
      data: {
        refCode: routeRow.ref_code,
        name: routeRow.name,
        friends: (friends.results ?? []).map((f) => ({
          id: f.id,
          displayName: f.display_name,
          trackedAt: f.tracked_at,
        })),
      },
    },
  };
}

export async function liffLinksWrapPost(
  env: Env['Bindings'],
  fetchImpl: typeof fetch,
  body: { url: string; ref?: string },
): Promise<LiffJsonResult> {
  if (!body.url) {
    return { status: 400, body: { success: false, error: 'url is required' } };
  }

  const safeRedirect = resolveSafeRedirectUrl(body.url, env as LiffRedirectEnv);
  if (!safeRedirect) {
    return {
      status: 400,
      body: {
        success: false,
        error:
          'url must be an https URL or same-site path allowed by WEB_URL / WORKER_URL / LIFF_URL / ALLOWED_ORIGINS',
      },
    };
  }

  const dnsOk = await assertHttpsOutboundUrlResolvedSafe(safeRedirect, fetchImpl);
  if (!dnsOk.ok) {
    return {
      status: 400,
      body: {
        success: false,
        error:
          'url must be an https URL or same-site path allowed by WEB_URL / WORKER_URL / LIFF_URL / ALLOWED_ORIGINS',
      },
    };
  }

  const liffUrl = env.LIFF_URL;
  if (!liffUrl) {
    return { status: 500, body: { success: false, error: 'LIFF_URL not configured' } };
  }

  const params = new URLSearchParams({ redirect: safeRedirect });
  if (body.ref) {
    params.set('ref', body.ref);
  }

  const wrappedUrl = `${liffUrl}?${params.toString()}`;
  return { status: 200, body: { success: true, data: { url: wrappedUrl } } };
}
