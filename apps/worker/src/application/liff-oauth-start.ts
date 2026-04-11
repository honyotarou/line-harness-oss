import { getLineAccountByChannelId } from '@line-crm/db';
import type { Env } from '../index.js';
import { signLiffOAuthState } from '../services/liff-oauth-state.js';
import { resolveSafeRedirectUrl, type LiffRedirectEnv } from '../services/liff-redirect.js';
import { liffStateSecret } from './liff-identity.js';

export type AuthLineStartInput = {
  db: D1Database;
  bindings: Env['Bindings'];
  origin: string;
  userAgent: string;
  ref: string;
  redirectRaw: string;
  gclid: string;
  fbclid: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  accountParam: string;
  uidParam: string;
};

/** Route maps to `c.redirect`, `c.html(renderAuthQrPage(env, scanTarget))`, or `c.html(errorPage(...))`. */
export type AuthLineStartResult =
  | { kind: 'log_error'; message: string; userHtmlMessage: string }
  | { kind: 'redirect'; location: string }
  | { kind: 'qr'; scanTarget: string }
  | { kind: 'generic_error'; userHtmlMessage: string };

export async function runAuthLineStart(input: AuthLineStartInput): Promise<AuthLineStartResult> {
  const {
    db,
    bindings,
    origin,
    userAgent,
    ref,
    redirectRaw,
    gclid,
    fbclid,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
    accountParam,
    uidParam,
  } = input;

  const stateSecret = liffStateSecret(bindings);
  if (!stateSecret) {
    return {
      kind: 'log_error',
      message: 'GET /auth/line: missing API_KEY / LIFF_STATE_SECRET (required to sign OAuth state)',
      userHtmlMessage: 'サーバー設定エラー: API_KEY または LIFF_STATE_SECRET が未設定です。',
    };
  }

  try {
    const redirect =
      redirectRaw.trim() === ''
        ? ''
        : (resolveSafeRedirectUrl(redirectRaw, bindings as LiffRedirectEnv) ?? '');
    const baseUrl = origin;
    let channelId = bindings.LINE_LOGIN_CHANNEL_ID;
    let liffUrl = (bindings.LIFF_URL ?? '').trim();
    if (accountParam) {
      const account = await getLineAccountByChannelId(db, accountParam);
      if (account?.login_channel_id) {
        channelId = account.login_channel_id;
      }
      if (account?.liff_id) {
        liffUrl = `https://liff.line.me/${account.liff_id}`;
      }
    }

    if (!accountParam && (!liffUrl || liffUrl.includes('YOUR_LIFF_ID'))) {
      return {
        kind: 'log_error',
        message: 'GET /auth/line: LIFF_URL is missing (required when account query is omitted)',
        userHtmlMessage:
          'サーバー設定エラー: LIFF_URL が未設定です。Cloudflare Worker の Variables に、LIFF の URL（例: https://liff.line.me/1234567890-AbCdEfGh）を設定してください。',
      };
    }

    const callbackUrl = `${baseUrl}/auth/callback`;

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

    const ua = userAgent.toLowerCase();
    const isMobile = /iphone|ipad|android|mobile/.test(ua);
    if (isMobile) {
      if (accountParam) {
        return { kind: 'redirect', location: loginUrl.toString() };
      }
      return { kind: 'redirect', location: liffTarget };
    }

    return { kind: 'qr', scanTarget };
  } catch (err) {
    console.error('GET /auth/line error:', err);
    return {
      kind: 'generic_error',
      userHtmlMessage: 'LINE ログインの開始に失敗しました。しばらくしてから再度お試しください。',
    };
  }
}
