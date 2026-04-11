import { LineClient } from '@line-crm/line-sdk';
import {
  addTagToFriend,
  createUser,
  enrollFriendInScenario,
  getEntryRouteByRefCode,
  getLineAccountByChannelId,
  getScenarioSteps,
  getScenarios,
  getUserByEmailCaseInsensitive,
  getUserById,
  jstNow,
  linkFriendToUser,
  recordRefTracking,
  upsertFriend,
} from '@line-crm/db';
import type { Env } from '../index.js';
import { assertHttpsOutboundUrlResolvedSafe } from '../services/outbound-url-resolve.js';
import { resolveSafeRedirectUrl, type LiffRedirectEnv } from '../services/liff-redirect.js';
import { verifyLiffOAuthState } from '../services/liff-oauth-state.js';
import { buildMessage, expandVariables } from '../services/step-delivery.js';
import { tryParseJsonRecord } from '../services/safe-json.js';
import { emailsMatchForRecovery, liffStateSecret } from './liff-identity.js';
import { completionPage, errorPage } from './liff-pages.js';

export type LiffOAuthCallbackInput = {
  db: D1Database;
  bindings: Env['Bindings'];
  origin: string;
  code: string | undefined;
  stateParam: string;
  oauthError: string | undefined;
  fetchImpl: typeof fetch;
};

export type LiffOAuthCallbackResult =
  | { kind: 'html'; html: string }
  | { kind: 'redirect'; location: string };

export async function runLiffOAuthCallback(
  input: LiffOAuthCallbackInput,
): Promise<LiffOAuthCallbackResult> {
  const { db, bindings, origin, code, stateParam, oauthError, fetchImpl } = input;

  if (oauthError || !code) {
    return { kind: 'html', html: errorPage(oauthError || 'Authorization failed') };
  }

  const parsedState = await verifyLiffOAuthState(stateParam, liffStateSecret(bindings));
  if (!parsedState) {
    return { kind: 'html', html: errorPage('Invalid or expired login state') };
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
    const baseUrl = origin;
    const callbackUrl = `${baseUrl}/auth/callback`;

    let loginChannelId = bindings.LINE_LOGIN_CHANNEL_ID;
    let loginChannelSecret = bindings.LINE_LOGIN_CHANNEL_SECRET;
    if (accountParam) {
      const account = await getLineAccountByChannelId(db, accountParam);
      if (account?.login_channel_id && account?.login_channel_secret) {
        loginChannelId = account.login_channel_id;
        loginChannelSecret = account.login_channel_secret;
      }
    }

    const tokenRes = await fetchImpl('https://api.line.me/oauth2/v2.1/token', {
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
      return { kind: 'html', html: errorPage('Token exchange failed') };
    }

    const tokens = await tokenRes.json<{
      access_token: string;
      id_token: string;
      token_type: string;
    }>();

    const verifyRes = await fetchImpl('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        id_token: tokens.id_token,
        client_id: loginChannelId,
      }),
    });

    if (!verifyRes.ok) {
      return { kind: 'html', html: errorPage('ID token verification failed') };
    }

    const verified = await verifyRes.json<{
      sub: string;
      name?: string;
      email?: string;
      picture?: string;
    }>();

    const profileRes = await fetchImpl('https://api.line.me/v2/profile', {
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

    const lineUserId = verified.sub;

    const friend = await upsertFriend(db, {
      lineUserId,
      displayName,
      pictureUrl,
      statusMessage: null,
    });

    let userId: string | null = null;

    const existingUserId = (friend as unknown as Record<string, unknown>).user_id as string | null;
    if (existingUserId) {
      userId = existingUserId;
    } else {
      if (verified.email) {
        const existingUser = await getUserByEmailCaseInsensitive(db, verified.email);
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

    if (ref) {
      await db
        .prepare(`UPDATE friends SET ref_code = ? WHERE id = ? AND ref_code IS NULL`)
        .bind(ref, friend.id)
        .run();

      const route = await getEntryRouteByRefCode(db, ref);

      await recordRefTracking(db, {
        refCode: ref,
        friendId: friend.id,
        entryRouteId: route?.id ?? null,
        sourceUrl: null,
      });

      if (route) {
        if (route.tag_id) {
          await addTagToFriend(db, friend.id, route.tag_id);
        }
      }
    }

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
      const merged = { ...(tryParseJsonRecord(existingMeta?.metadata || '{}') ?? {}), ...adMeta };
      await db
        .prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify(merged), jstNow(), friend.id)
        .run();
    }

    try {
      const matchedAccountId = accountParam
        ? ((await getLineAccountByChannelId(db, accountParam))?.id ?? null)
        : null;

      let accessToken = bindings.LINE_CHANNEL_ACCESS_TOKEN;
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
            await enrollFriendInScenario(db, friend.id, scenario.id);

            const steps = await getScenarioSteps(db, scenario.id);
            const firstStep = steps[0];
            if (firstStep && firstStep.delay_minutes === 0) {
              const authAllowChan = new Set<string>();
              const ap = accountParam?.trim();
              if (ap) authAllowChan.add(ap);
              const defCid = bindings.LINE_CHANNEL_ID?.trim();
              if (defCid) authAllowChan.add(defCid);
              const expandedContent = expandVariables(
                firstStep.message_content,
                friend as { id: string; display_name: string | null; user_id: string | null },
                bindings.WORKER_URL,
                { allowedAuthUrlChannelIds: authAllowChan },
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

    if (redirect) {
      const safe = resolveSafeRedirectUrl(redirect, bindings);
      if (safe) {
        const dnsOk = await assertHttpsOutboundUrlResolvedSafe(safe, fetchImpl);
        if (dnsOk.ok) {
          return { kind: 'redirect', location: safe };
        }
      }
    }

    if (accountParam) {
      const account = await getLineAccountByChannelId(db, accountParam);
      if (account) {
        try {
          const botInfo = await fetchImpl('https://api.line.me/v2/bot/info', {
            headers: { Authorization: `Bearer ${account.channel_access_token}` },
          });
          if (botInfo.ok) {
            const bot = (await botInfo.json()) as { basicId?: string };
            if (bot.basicId) {
              return { kind: 'redirect', location: `https://line.me/R/ti/p/${bot.basicId}` };
            }
          }
        } catch {
          /* fall through */
        }
      }
    }

    return { kind: 'html', html: completionPage(displayName, pictureUrl, ref) };
  } catch (err) {
    console.error('Auth callback error:', err);
    return { kind: 'html', html: errorPage('Internal error') };
  }
}
