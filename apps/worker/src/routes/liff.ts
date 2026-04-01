import { Hono } from 'hono';
import {
  getFriendByLineUserId,
  createUser,
  getUserByEmail,
  getUserById,
  linkFriendToUser,
  upsertFriend,
  getEntryRouteByRefCode,
  recordRefTracking,
  addTagToFriend,
  getLineAccountByChannelId,
  jstNow,
} from '@line-crm/db';
import type { Env } from '../index.js';
import { signLiffOAuthState, verifyLiffOAuthState } from '../services/liff-oauth-state.js';
import { resolveSafeRedirectUrl } from '../services/liff-redirect.js';
import { verifyLineLoginIdToken } from '../services/line-login-id-token.js';
import { renderAuthQrPage } from '../ui/landing.js';

const liffRoutes = new Hono<Env>();

function liffStateSecret(env: Env['Bindings']): string {
  return env.LIFF_STATE_SECRET?.trim() || env.API_KEY;
}

function emailsMatchForRecovery(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const BOOKING_PHONE_FALLBACK_MESSAGE =
  'オンラインで予約を完了できない場合は、お電話にてご連絡ください。';

type LiffLineUserBody = { lineUserId: string; idToken: string };

type LiffFriendFromLineUserResult =
  | { ok: true; friend: NonNullable<Awaited<ReturnType<typeof getFriendByLineUserId>>> }
  | { ok: false; status: 400 | 401 | 404; body: { success: false; error: string } };

type LiffVerifiedFriendOnlyResult =
  | { ok: true; friend: NonNullable<Awaited<ReturnType<typeof getFriendByLineUserId>>> }
  | { ok: false; status: 401 | 404; body: { success: false; error: string } };

async function verifyLiffIdTokenAndLoadFriend(
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

async function resolveLiffFriendFromLineUserBody(
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

function normalizeBookingFallbackTelUri(trimmed: string): string {
  return trimmed.startsWith('tel:') ? trimmed : `tel:${trimmed}`;
}

// ─── LINE Login OAuth (bot_prompt=aggressive) ───────────────────

/**
 * GET /auth/line — redirect to LINE Login with bot_prompt=aggressive
 *
 * This is THE friend-add URL. Put this on LPs, SNS, ads.
 * Query params:
 *   ?ref=xxx     — attribution tracking
 *   ?redirect=url — redirect after completion
 *   ?gclid=xxx   — Google Ads click ID
 *   ?fbclid=xxx  — Meta Ads click ID
 *   ?utm_source=xxx, utm_medium, utm_campaign, utm_content, utm_term — UTM params
 */
liffRoutes.get('/auth/line', async (c) => {
  const stateSecret = liffStateSecret(c.env);
  if (!stateSecret) {
    console.error(
      'GET /auth/line: missing API_KEY / LIFF_STATE_SECRET (required to sign OAuth state)',
    );
    return c.html(errorPage('サーバー設定エラー: API_KEY または LIFF_STATE_SECRET が未設定です。'));
  }

  try {
    const ref = c.req.query('ref') || '';
    const redirect = c.req.query('redirect') || '';
    const gclid = c.req.query('gclid') || '';
    const fbclid = c.req.query('fbclid') || '';
    const utmSource = c.req.query('utm_source') || '';
    const utmMedium = c.req.query('utm_medium') || '';
    const utmCampaign = c.req.query('utm_campaign') || '';
    const utmContent = c.req.query('utm_content') || '';
    const utmTerm = c.req.query('utm_term') || '';
    const accountParam = c.req.query('account') || '';
    const uidParam = c.req.query('uid') || ''; // existing user UUID for cross-account linking
    const baseUrl = new URL(c.req.url).origin;

    // Multi-account: resolve LINE Login channel + LIFF from DB if account param provided
    let channelId = c.env.LINE_LOGIN_CHANNEL_ID;
    let liffUrl = (c.env.LIFF_URL ?? '').trim();
    if (accountParam) {
      const account = await getLineAccountByChannelId(c.env.DB, accountParam);
      if (account?.login_channel_id) {
        channelId = account.login_channel_id;
      }
      if (account?.liff_id) {
        liffUrl = `https://liff.line.me/${account.liff_id}`;
      }
    }

    // Dashboard / default friend-add link has no `account=` — needs LIFF_URL in Worker vars.
    if (!accountParam && !liffUrl) {
      console.error('GET /auth/line: LIFF_URL is missing (required when account query is omitted)');
      return c.html(
        errorPage(
          'サーバー設定エラー: LIFF_URL が未設定です。Cloudflare Worker の Variables に、LIFF の URL（例: https://liff.line.me/1234567890-AbCdEfGh）を設定してください。',
        ),
      );
    }

    const callbackUrl = `${baseUrl}/auth/callback`;

    // Build LIFF URL with ref + ad params (for mobile → LINE app)
    // Extract LIFF ID from URL and pass as query param so the app can init correctly
    const liffIdMatch = liffUrl.match(/liff\.line\.me\/([0-9]+-[A-Za-z0-9]+)/);
    const liffParams = new URLSearchParams();
    if (liffIdMatch) liffParams.set('liffId', liffIdMatch[1]);
    if (ref) liffParams.set('ref', ref);
    if (redirect) liffParams.set('redirect', redirect);
    if (gclid) liffParams.set('gclid', gclid);
    if (fbclid) liffParams.set('fbclid', fbclid);
    if (utmSource) liffParams.set('utm_source', utmSource);
    if (utmMedium) liffParams.set('utm_medium', utmMedium);
    if (utmCampaign) liffParams.set('utm_campaign', utmCampaign);
    if (utmContent) liffParams.set('utm_content', utmContent);
    if (utmTerm) liffParams.set('utm_term', utmTerm);
    if (uidParam) liffParams.set('uid', uidParam);
    if (accountParam) liffParams.set('account', accountParam);
    const liffTarget = liffParams.toString() ? `${liffUrl}?${liffParams.toString()}` : liffUrl;

    // Build OAuth URL (for desktop fallback)
    // Pack all tracking params into signed state so they survive the OAuth redirect (tamper-resistant)
    const encodedState = await signLiffOAuthState(
      {
        ref,
        redirect,
        gclid,
        fbclid,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
        account: accountParam,
        uid: uidParam,
      },
      stateSecret,
    );
    const loginUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
    loginUrl.searchParams.set('response_type', 'code');
    loginUrl.searchParams.set('client_id', channelId);
    loginUrl.searchParams.set('redirect_uri', callbackUrl);
    loginUrl.searchParams.set('scope', 'profile openid email');
    loginUrl.searchParams.set('bot_prompt', 'aggressive');
    loginUrl.searchParams.set('state', encodedState);
    const scanTarget = accountParam ? loginUrl.toString() : liffTarget;

    // Mobile: redirect to LIFF URL (opens LINE app directly)
    // Exception: cross-account links (account param) use OAuth directly
    // because Account A's LIFF can't open from Account B's LINE chat
    const ua = (c.req.header('user-agent') || '').toLowerCase();
    const isMobile = /iphone|ipad|android|mobile/.test(ua);
    if (isMobile) {
      if (accountParam) {
        // Cross-account: use OAuth (LIFF won't work across accounts)
        return c.redirect(loginUrl.toString());
      }
      return c.redirect(liffTarget);
    }

    // PC: show QR code page
    return c.html(renderAuthQrPage(c.env, scanTarget));
  } catch (err) {
    console.error('GET /auth/line error:', err);
    return c.html(
      errorPage('LINE ログインの開始に失敗しました。しばらくしてから再度お試しください。'),
    );
  }
});

/**
 * GET /auth/callback — LINE Login callback
 *
 * Exchanges code for tokens, extracts sub (UUID), links friend.
 */
liffRoutes.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  const stateParam = c.req.query('state') || '';
  const error = c.req.query('error');

  if (error || !code) {
    return c.html(errorPage(error || 'Authorization failed'));
  }

  const parsedState = await verifyLiffOAuthState(stateParam, liffStateSecret(c.env));
  if (!parsedState) {
    return c.html(errorPage('Invalid or expired login state'));
  }

  const {
    ref,
    redirect,
    gclid,
    fbclid,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
    account: accountParam,
    uid: uidParam,
  } = parsedState;

  try {
    const baseUrl = new URL(c.req.url).origin;
    const callbackUrl = `${baseUrl}/auth/callback`;

    // Multi-account: resolve LINE Login credentials from DB
    let loginChannelId = c.env.LINE_LOGIN_CHANNEL_ID;
    let loginChannelSecret = c.env.LINE_LOGIN_CHANNEL_SECRET;
    if (accountParam) {
      const account = await getLineAccountByChannelId(c.env.DB, accountParam);
      if (account?.login_channel_id && account?.login_channel_secret) {
        loginChannelId = account.login_channel_id;
        loginChannelSecret = account.login_channel_secret;
      }
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: loginChannelId,
        client_secret: loginChannelSecret,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Token exchange failed:', errText);
      return c.html(errorPage('Token exchange failed'));
    }

    const tokens = await tokenRes.json<{
      access_token: string;
      id_token: string;
      token_type: string;
    }>();

    // Verify ID token to get sub (use resolved login channel ID, not env default)
    const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        id_token: tokens.id_token,
        client_id: loginChannelId,
      }),
    });

    if (!verifyRes.ok) {
      return c.html(errorPage('ID token verification failed'));
    }

    const verified = await verifyRes.json<{
      sub: string;
      name?: string;
      email?: string;
      picture?: string;
    }>();

    // Get profile via access token
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    let displayName = verified.name || 'Unknown';
    let pictureUrl: string | null = null;
    if (profileRes.ok) {
      const profile = await profileRes.json<{
        userId: string;
        displayName: string;
        pictureUrl?: string;
      }>();
      displayName = profile.displayName;
      pictureUrl = profile.pictureUrl || null;
    }

    const db = c.env.DB;
    const lineUserId = verified.sub;

    // Upsert friend (may not exist yet if webhook hasn't fired)
    const friend = await upsertFriend(db, {
      lineUserId,
      displayName,
      pictureUrl,
      statusMessage: null,
    });

    // Create or find user → link
    let userId: string | null = null;

    // Check if already linked
    const existingUserId = (friend as unknown as Record<string, unknown>).user_id as string | null;
    if (existingUserId) {
      userId = existingUserId;
    } else {
      // Try to find by email
      if (verified.email) {
        const existingUser = await getUserByEmail(db, verified.email);
        if (existingUser) userId = existingUser.id;
      }

      const uidTrim = uidParam.trim();
      if (!userId && uidTrim && verified.email) {
        const saved = await getUserById(db, uidTrim);
        if (saved && emailsMatchForRecovery(saved.email, verified.email)) {
          userId = saved.id;
        }
      }

      if (!userId) {
        const newUser = await createUser(db, {
          email: verified.email || null,
          displayName,
        });
        userId = newUser.id;
      }

      await linkFriendToUser(db, friend.id, userId);
    }

    // Attribution tracking
    if (ref) {
      // Save ref_code on the friend record (first touch wins — only set if not already set)
      await db
        .prepare(`UPDATE friends SET ref_code = ? WHERE id = ? AND ref_code IS NULL`)
        .bind(ref, friend.id)
        .run();

      // Look up entry route config
      const route = await getEntryRouteByRefCode(db, ref);

      // Persist tracking event
      await recordRefTracking(db, {
        refCode: ref,
        friendId: friend.id,
        entryRouteId: route?.id ?? null,
        sourceUrl: null,
      });

      if (route) {
        // Auto-tag the friend
        if (route.tag_id) {
          await addTagToFriend(db, friend.id, route.tag_id);
        }
        // Auto-enroll in scenario (scenario_id stored; enrollment handled by scenario engine)
        // Future: call enrollFriendInScenario(db, friend.id, route.scenario_id) here
      }
    }

    // Save ad click IDs + UTM to friend metadata (for future ad API postback)
    const adMeta: Record<string, string> = {};
    if (gclid) adMeta.gclid = gclid;
    if (fbclid) adMeta.fbclid = fbclid;
    if (utmSource) adMeta.utm_source = utmSource;
    if (utmMedium) adMeta.utm_medium = utmMedium;
    if (utmCampaign) adMeta.utm_campaign = utmCampaign;
    if (utmContent) adMeta.utm_content = utmContent;
    if (utmTerm) adMeta.utm_term = utmTerm;

    if (Object.keys(adMeta).length > 0) {
      const existingMeta = await db
        .prepare('SELECT metadata FROM friends WHERE id = ?')
        .bind(friend.id)
        .first<{ metadata: string }>();
      const merged = { ...JSON.parse(existingMeta?.metadata || '{}'), ...adMeta };
      await db
        .prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify(merged), jstNow(), friend.id)
        .run();
    }

    // Auto-enroll in friend_add scenarios + immediate delivery (skip delivery window)
    try {
      const {
        getScenarios,
        enrollFriendInScenario: enroll,
        getScenarioSteps,
      } = await import('@line-crm/db');
      const { LineClient } = await import('@line-crm/line-sdk');
      const { buildMessage, expandVariables } = await import('../services/step-delivery.js');

      // Resolve which account this friend belongs to
      const matchedAccountId = accountParam
        ? ((await getLineAccountByChannelId(db, accountParam))?.id ?? null)
        : null;

      // Get access token for this account
      let accessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (accountParam) {
        const acct = await getLineAccountByChannelId(db, accountParam);
        if (acct) accessToken = acct.channel_access_token;
      }
      const lineClient = new LineClient(accessToken);

      const scenarios = await getScenarios(db);
      for (const scenario of scenarios) {
        const scenarioAccountMatch =
          !scenario.line_account_id ||
          !matchedAccountId ||
          scenario.line_account_id === matchedAccountId;
        if (scenario.trigger_type === 'friend_add' && scenario.is_active && scenarioAccountMatch) {
          const existing = await db
            .prepare('SELECT id FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?')
            .bind(friend.id, scenario.id)
            .first<{ id: string }>();
          if (!existing) {
            await enroll(db, friend.id, scenario.id);

            // Immediate delivery of first step (skip delivery window)
            const steps = await getScenarioSteps(db, scenario.id);
            const firstStep = steps[0];
            if (firstStep && firstStep.delay_minutes === 0) {
              const expandedContent = expandVariables(
                firstStep.message_content,
                friend as { id: string; display_name: string | null; user_id: string | null },
                c.env.WORKER_URL,
              );
              await lineClient.pushMessage(lineUserId, [
                buildMessage(firstStep.message_type, expandedContent),
              ]);
            }
          }
        }
      }
    } catch (err) {
      console.error('OAuth scenario enrollment error:', err);
    }

    // Redirect or show completion (only allowlisted origins — no open redirect)
    if (redirect) {
      const safe = resolveSafeRedirectUrl(redirect, c.env);
      if (safe) {
        return c.redirect(safe);
      }
    }

    // If friend is not yet following this bot, redirect to friend-add page
    if (accountParam) {
      const account = await getLineAccountByChannelId(db, accountParam);
      if (account) {
        // Fetch bot basic ID for friend-add URL
        try {
          const botInfo = await fetch('https://api.line.me/v2/bot/info', {
            headers: { Authorization: `Bearer ${account.channel_access_token}` },
          });
          if (botInfo.ok) {
            const bot = (await botInfo.json()) as { basicId?: string };
            if (bot.basicId) {
              return c.redirect(`https://line.me/R/ti/p/${bot.basicId}`);
            }
          }
        } catch {
          // Fall through to completion page
        }
      }
    }

    return c.html(completionPage(displayName, pictureUrl, ref));
  } catch (err) {
    console.error('Auth callback error:', err);
    return c.html(errorPage('Internal error'));
  }
});

// ─── Existing LIFF endpoints ────────────────────────────────────

// POST /api/liff/profile — requires LINE Login ID token; sub must match lineUserId (no unauthenticated PII)
liffRoutes.post('/api/liff/profile', async (c) => {
  try {
    const body = await c.req.json<LiffLineUserBody>();
    const resolved = await resolveLiffFriendFromLineUserBody(
      c.env.DB,
      c.env.LINE_LOGIN_CHANNEL_ID,
      body,
    );
    if (!resolved.ok) {
      return c.json(resolved.body, resolved.status);
    }
    const { friend } = resolved;

    return c.json({
      success: true,
      data: {
        id: friend.id,
        displayName: friend.display_name,
        isFollowing: Boolean(friend.is_following),
        userId: (friend as unknown as Record<string, unknown>).user_id ?? null,
      },
    });
  } catch (err) {
    console.error('POST /api/liff/profile error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/liff/booking/phone-fallback — ID token + known friend; returns clinic tel for offline booking path
liffRoutes.post('/api/liff/booking/phone-fallback', async (c) => {
  try {
    const body = await c.req.json<LiffLineUserBody>();
    if (!body.lineUserId || !body.idToken) {
      return c.json({ success: false, error: 'lineUserId and idToken are required' }, 400);
    }

    const telRaw = c.env.BOOKING_FALLBACK_TEL?.trim();
    if (!telRaw) {
      return c.json({ success: false, error: 'Booking phone fallback is not configured' }, 503);
    }
    const telUri = normalizeBookingFallbackTelUri(telRaw);

    const resolved = await verifyLiffIdTokenAndLoadFriend(
      c.env.DB,
      c.env.LINE_LOGIN_CHANNEL_ID,
      body.lineUserId,
      body.idToken,
    );
    if (!resolved.ok) {
      return c.json(resolved.body, resolved.status);
    }

    return c.json({
      success: true,
      data: {
        telUri,
        message: BOOKING_PHONE_FALLBACK_MESSAGE,
      },
    });
  } catch (err) {
    console.error('POST /api/liff/booking/phone-fallback error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/liff/link - link friend to user UUID (public, verified via LINE ID token)
liffRoutes.post('/api/liff/link', async (c) => {
  try {
    const body = await c.req.json<{
      idToken: string;
      displayName?: string | null;
      ref?: string;
      existingUuid?: string;
    }>();

    if (!body.idToken) {
      return c.json({ success: false, error: 'idToken is required' }, 400);
    }

    const verified = await verifyLineLoginIdToken(
      c.env.DB,
      c.env.LINE_LOGIN_CHANNEL_ID,
      body.idToken,
    );
    if (!verified) {
      return c.json({ success: false, error: 'Invalid ID token' }, 401);
    }
    const lineUserId = verified.sub;
    const email = verified.email || null;

    const db = c.env.DB;
    const friend = await getFriendByLineUserId(db, lineUserId);
    if (!friend) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    if ((friend as unknown as Record<string, unknown>).user_id) {
      // Still save ref even if already linked
      if (body.ref) {
        await db
          .prepare('UPDATE friends SET ref_code = ? WHERE id = ? AND ref_code IS NULL')
          .bind(body.ref, friend.id)
          .run();
      }
      return c.json({
        success: true,
        data: {
          userId: (friend as unknown as Record<string, unknown>).user_id,
          alreadyLinked: true,
        },
      });
    }

    let userId: string | null = null;
    if (email) {
      const existingUser = await getUserByEmail(db, email);
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

    // Save ref_code from LIFF (first touch wins)
    if (body.ref) {
      await db
        .prepare('UPDATE friends SET ref_code = ? WHERE id = ? AND ref_code IS NULL')
        .bind(body.ref, friend.id)
        .run();

      // Record ref tracking
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

    return c.json({
      success: true,
      data: { userId, alreadyLinked: false },
    });
  } catch (err) {
    console.error('POST /api/liff/link error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── Attribution Analytics ──────────────────────────────────────

/**
 * GET /api/analytics/ref-summary — ref code analytics summary
 */
liffRoutes.get('/api/analytics/ref-summary', async (c) => {
  try {
    const db = c.env.DB;
    const lineAccountId = c.req.query('lineAccountId');
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

    return c.json({
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
    });
  } catch (err) {
    console.error('GET /api/analytics/ref-summary error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/analytics/ref/:refCode — detailed friend list for a single ref code
 */
liffRoutes.get('/api/analytics/ref/:refCode', async (c) => {
  try {
    const db = c.env.DB;
    const refCode = c.req.param('refCode');

    const routeRow = await db
      .prepare(`SELECT ref_code, name FROM entry_routes WHERE ref_code = ?`)
      .bind(refCode)
      .first<{ ref_code: string; name: string }>();

    if (!routeRow) {
      return c.json({ success: false, error: 'Entry route not found' }, 404);
    }

    const lineAccountId = c.req.query('lineAccountId');
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

    return c.json({
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
    });
  } catch (err) {
    console.error('GET /api/analytics/ref/:refCode error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/links/wrap - wrap a URL with LIFF redirect proxy
liffRoutes.post('/api/links/wrap', async (c) => {
  try {
    const body = await c.req.json<{ url: string; ref?: string }>();
    if (!body.url) {
      return c.json({ success: false, error: 'url is required' }, 400);
    }

    const liffUrl = c.env.LIFF_URL;
    if (!liffUrl) {
      return c.json({ success: false, error: 'LIFF_URL not configured' }, 500);
    }

    const params = new URLSearchParams({ redirect: body.url });
    if (body.ref) {
      params.set('ref', body.ref);
    }

    const wrappedUrl = `${liffUrl}?${params.toString()}`;
    return c.json({ success: true, data: { url: wrappedUrl } });
  } catch (err) {
    console.error('POST /api/links/wrap error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── HTML Templates ─────────────────────────────────────────────

function authLandingPage(liffUrl: string, oauthUrl: string): string {
  // Extract LIFF ID from URL like https://liff.line.me/{LIFF_ID}?ref=test
  const liffIdMatch = liffUrl.match(/liff\.line\.me\/([^?]+)/);
  const liffId = liffIdMatch ? liffIdMatch[1] : '';
  // Query string part (e.g., ?ref=test)
  const qsIndex = liffUrl.indexOf('?');
  const liffQs = qsIndex >= 0 ? liffUrl.slice(qsIndex) : '';

  // line:// scheme to force open LINE app with LIFF
  const lineSchemeUrl = `https://line.me/R/app/${liffId}${liffQs}`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LINE で開く</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', system-ui, sans-serif; background: #06C755; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; padding: 40px 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); text-align: center; max-width: 400px; width: 90%; }
    .line-icon { font-size: 48px; margin-bottom: 16px; }
    h2 { font-size: 20px; color: #333; margin-bottom: 8px; }
    .sub { font-size: 14px; color: #999; margin-bottom: 24px; }
    .btn { display: block; width: 100%; padding: 16px; border: none; border-radius: 8px; font-size: 16px; font-weight: 700; text-decoration: none; text-align: center; cursor: pointer; transition: opacity 0.15s; font-family: inherit; }
    .btn:active { opacity: 0.85; }
    .btn-line { background: #06C755; color: #fff; margin-bottom: 12px; }
    .btn-web { background: #f5f5f5; color: #666; font-size: 13px; padding: 12px; }
    .loading { margin-top: 16px; font-size: 13px; color: #999; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="line-icon">💬</div>
    <h2>LINEで開く</h2>
    <p class="sub">LINEアプリが起動します</p>
    <a href="${escapeHtml(lineSchemeUrl)}" class="btn btn-line" id="openBtn">LINEアプリで開く</a>
    <a href="${escapeHtml(oauthUrl)}" class="btn btn-web" id="pcBtn">PCの方・LINEが開かない方</a>
    <p class="loading hidden" id="loading">LINEアプリを起動中...</p>
  </div>
  <script>
    var lineUrl = '${escapeHtml(lineSchemeUrl)}';
    var ua = navigator.userAgent.toLowerCase();
    var isMobile = /iphone|ipad|android/.test(ua);
    var isLine = /line\\//.test(ua);
    var isIOS = /iphone|ipad/.test(ua);
    var isAndroid = /android/.test(ua);

    if (isLine) {
      // Already in LINE — go to LIFF directly
      window.location.href = '${escapeHtml(liffUrl)}';
    } else if (isMobile) {
      // Mobile browser — try to open LINE app
      document.getElementById('loading').classList.remove('hidden');
      document.getElementById('openBtn').classList.add('hidden');

      // Use line.me/R/app/ which is a Universal Link (iOS) / App Link (Android)
      // This opens LINE app directly without showing browser login
      setTimeout(function() {
        window.location.href = lineUrl;
      }, 100);

      // Fallback: if LINE app doesn't open within 2s, show the button
      setTimeout(function() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('openBtn').classList.remove('hidden');
        document.getElementById('openBtn').textContent = 'もう一度試す';
      }, 2500);
    }
  </script>
</body>
</html>`;
}

function completionPage(displayName: string, pictureUrl: string | null, ref: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登録完了</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', system-ui, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; padding: 40px 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); text-align: center; max-width: 400px; width: 90%; }
    .check { width: 64px; height: 64px; border-radius: 50%; background: #06C755; color: #fff; font-size: 32px; line-height: 64px; margin: 0 auto 16px; }
    h2 { font-size: 20px; color: #06C755; margin-bottom: 16px; }
    .profile { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 16px 0; }
    .profile img { width: 48px; height: 48px; border-radius: 50%; }
    .profile .name { font-size: 16px; font-weight: 600; }
    .message { font-size: 14px; color: #666; line-height: 1.6; margin-top: 12px; }
    .ref { display: inline-block; margin-top: 12px; padding: 4px 12px; background: #f0f0f0; border-radius: 12px; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h2>登録完了！</h2>
    <div class="profile">
      ${pictureUrl ? `<img src="${pictureUrl}" alt="">` : ''}
      <p class="name">${escapeHtml(displayName)} さん</p>
    </div>
    <p class="message">ありがとうございます！<br>これからお役立ち情報をお届けします。<br>このページは閉じて大丈夫です。</p>
    ${ref ? `<p class="ref">${escapeHtml(ref)}</p>` : ''}
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>エラー</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', system-ui, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; padding: 40px 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); text-align: center; max-width: 400px; width: 90%; }
    h2 { font-size: 18px; color: #e53e3e; margin-bottom: 12px; }
    p { font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="card">
    <h2>エラー</h2>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { liffRoutes };
