import { Hono } from 'hono';
import { getLineAccounts } from '@line-crm/db';
import { lineAccountDbOptions } from './services/line-account-at-rest-key.js';
import { adminRbacMiddleware } from './middleware/admin-rbac.js';
import { authMiddleware } from './middleware/auth.js';
import { cloudflareAccessMiddleware } from './middleware/cloudflare-access.js';
import { cfBotGuardMiddleware } from './middleware/cf-bot-guard.js';
import { hostHeaderMiddleware } from './middleware/host-header.js';
import { apiWriteContentTypeMiddleware } from './middleware/api-write-content-type.js';
import { securityHeadersMiddleware } from './middleware/security-headers.js';
import {
  ACCESS_CONTROL_ALLOW_HEADERS,
  buildAllowedOrigins,
  isAllowedSharedLineCorsPath,
  isAllowedOrigin,
  isSharedLineHostedOrigin,
  shouldApplyCorsForOriginHeader,
} from './services/cors-policy.js';
import { enforceRateLimit } from './services/request-rate-limit.js';
import { runScheduledJobs } from './services/scheduler.js';
import { renderShortLinkLanding, type LandingEnv } from './ui/landing.js';
import { authRoutes } from './routes/auth.js';
import { webhook } from './routes/webhook.js';
import { friends } from './routes/friends.js';
import { tags } from './routes/tags.js';
import { scenarios } from './routes/scenarios.js';
import { broadcasts } from './routes/broadcasts.js';
import { users } from './routes/users.js';
import { lineAccounts } from './routes/line-accounts.js';
import { conversions } from './routes/conversions.js';
import { affiliates } from './routes/affiliates.js';
import { openapi } from './routes/openapi.js';
import { liffRoutes } from './routes/liff.js';
// Round 3 ルート
import { webhooks } from './routes/webhooks.js';
import { calendar } from './routes/calendar.js';
import { reminders } from './routes/reminders.js';
import { scoring } from './routes/scoring.js';
import { templates } from './routes/templates.js';
import { chats } from './routes/chats.js';
import { notifications } from './routes/notifications.js';
import { stripe } from './routes/stripe.js';
import { health } from './routes/health.js';
import { automations } from './routes/automations.js';
import { richMenus } from './routes/rich-menus.js';
import { trackedLinks } from './routes/tracked-links.js';
import { forms } from './routes/forms.js';
import { adminPrincipalRolesRoutes } from './routes/admin-principal-roles.js';

export type Env = {
  Variables: {
    /** Set by {@link cloudflareAccessMiddleware} after JWT verification. */
    cfAccessJwtPayload?: Record<string, unknown>;
  };
  Bindings: {
    DB: D1Database;
    LINE_CHANNEL_SECRET: string;
    LINE_CHANNEL_ACCESS_TOKEN: string;
    API_KEY: string;
    /**
     * Optional HMAC secret for admin session tokens (cookie / Bearer session).
     * When unset, `API_KEY` is used (legacy). Set in production to limit blast radius if the session signer leaks.
     */
    ADMIN_SESSION_SECRET?: string;
    LIFF_URL: string;
    LINE_CHANNEL_ID: string;
    LINE_LOGIN_CHANNEL_ID: string;
    LINE_LOGIN_CHANNEL_SECRET: string;
    WORKER_URL: string;
    WEB_URL?: string;
    /** Optional; overrides default footer text in the LINE Flex after LIFF form submit. */
    FORM_SUBMIT_FLEX_FOOTER?: string;
    ALLOWED_ORIGINS?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    /** Optional; defaults to API_KEY. Used to HMAC-sign LINE Login OAuth `state`. */
    LIFF_STATE_SECRET?: string;
    /** Optional; defaults to API_KEY. HMAC secret for signed `?f=` on tracked links (GET /t/:id). */
    TRACKING_LINK_SECRET?: string;
    /**
     * `1` / `true`: refuse tracked-link `?f=` signing/verification unless `TRACKING_LINK_SECRET` is set
     * (no API_KEY fallback — mitigates token forgery if API_KEY leaks).
     */
    REQUIRE_TRACKING_LINK_SECRET?: string;
    /**
     * `1` / `true`: OAuth `state` must be signed with `LIFF_STATE_SECRET` only (no `API_KEY` fallback).
     * Use in production so a leaked API key cannot forge login state.
     */
    REQUIRE_LIFF_STATE_SECRET?: string;
    /**
     * `1` / `true`: allow OAuth `state` signing with `API_KEY` when `LIFF_STATE_SECRET` is unset (local dev only).
     */
    ALLOW_LIFF_OAUTH_API_KEY_FALLBACK?: string;
    /**
     * Base64 (standard or URL-safe) of 32 raw bytes — seals `line_accounts` tokens/secrets at rest in D1 (`lh1:` prefix).
     */
    LINE_ACCOUNT_SECRETS_KEY?: string;
    /** `1` / `true`: on friend add, send welcome Flex (anxiety picker) once; skip DB scenario step-0 reply if delay=0. Postback `anxiety=*` always handled when user taps buttons. */
    WELCOME_ANXIETY_FLOW?: string;
    /** Optional LIFF URL for booking button in anxiety follow-up (defaults to `LIFF_URL`). */
    LIFF_BOOKING_URL?: string;
    /** Optional hero image URL (HTTPS) for welcome Flex (e.g. mascot photo). */
    WELCOME_ANXIETY_HERO_URL?: string;
    /** Optional HTTPS URLs for footer links on follow-up Flex. */
    WELCOME_ANXIETY_LINK_FLOW?: string;
    WELCOME_ANXIETY_LINK_PREP?: string;
    WELCOME_ANXIETY_LINK_FAQ?: string;
    /** `1` / `true`: 2通目 Flex に予約用 LIFF ボタンを出さない（リッチメニューのみ案内）。未設定時はショートカットボタンあり。 */
    WELCOME_ANXIETY_RICH_MENU_ONLY?: string;
    /** Optional `tel:` URI or dialable digits for LIFF when online booking cannot complete. */
    BOOKING_FALLBACK_TEL?: string;
    /**
     * `1` / `true` / `yes` / `on`: expose `/docs` and `/openapi.json` (Swagger). Off by default.
     * Set in `.dev.vars` / production when you want public API docs.
     */
    ENABLE_PUBLIC_OPENAPI?: string;
    /** When set, forces OpenAPI off even if ENABLE_PUBLIC_OPENAPI is on. */
    DISABLE_PUBLIC_OPENAPI?: string;
    /**
     * `1` / `true`: use `SameSite=None` on admin session cookies for non-local hosts (cross-site only).
     * Default is `Lax` (stronger CSRF posture when admin UI and API share a compatible setup).
     */
    ADMIN_SESSION_COOKIE_SAMESITE_NONE?: string;
    /**
     * Optional; Cloudflare Bot Management score threshold (1–99) for a few public POST endpoints
     * (`/api/auth/login`, `/api/affiliates/click`). When `cf.botManagement.score` is present and below
     * this value, respond 403. Absent score is allowed unless REQUIRE_CF_BOT_SIGNAL is on.
     */
    MIN_CF_BOT_SCORE?: string;
    /**
     * `1` / `true`: on bot-protected routes, require `cf.botManagement.score` (403 if missing).
     * Use with Bot Management on the zone; local wrangler without `cf` will need this off.
     */
    REQUIRE_CF_BOT_SIGNAL?: string;
    /**
     * `1` / `true` / `yes` / `on`: require valid `Cf-Access-Jwt-Assertion` on protected routes
     * (Cloudflare Zero Trust / Access in front of this Worker). Set with CLOUDFLARE_ACCESS_TEAM_DOMAIN.
     */
    REQUIRE_CLOUDFLARE_ACCESS_JWT?: string;
    /** e.g. `yourteam.cloudflareaccess.com` — used to fetch JWKS and validate JWT `iss`. */
    CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
    /** Optional comma-separated allowlist for JWT `email` claim after signature verification. */
    CLOUDFLARE_ACCESS_ALLOWED_EMAILS?: string;
    /**
     * Optional Access JWT `aud` (application audience). When set, the token must list this audience
     * (string or array) after signature verification — reduces cross-app JWT reuse on the same team domain.
     */
    CLOUDFLARE_ACCESS_AUDIENCE?: string;
    /**
     * Optional comma-separated hostnames for `Host` header allowlisting (DNS rebinding mitigation).
     * When unset or empty, no check (typical for local dev). In production, set to your worker hostname(s).
     */
    ALLOWED_HOSTNAMES?: string;
    /**
     * `1` / `true`: allow `GET /api/auth/session` to treat `Authorization: Bearer <API_KEY>` as authenticated.
     * Default is off so a stolen API key cannot pass session checks without a real session JWT.
     */
    ALLOW_LEGACY_API_KEY_BEARER_SESSION?: string;
    /**
     * `1` / `true`: refuse login/session issuance unless `ADMIN_SESSION_SECRET` is set (sessions must not
     * share the same signing key as `API_KEY`).
     */
    REQUIRE_ADMIN_SESSION_SECRET?: string;
    /**
     * `1` / `true`: allow HMAC admin sessions to be signed / verified with `API_KEY` when
     * `ADMIN_SESSION_SECRET` is unset, even if `WORKER_URL` is a non-local HTTPS deployment.
     * Default is off for non-local HTTPS (dedicated secret required).
     */
    ALLOW_LEGACY_API_KEY_SESSION_SIGNER?: string;
    /**
     * `1` / `true`: when more than one active LINE account exists, require explicit `lineAccountId` on
     * scoped list APIs (same validation as Zero Trust principals) to block cross-account enumeration with one API key.
     */
    MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID?: string;
    /**
     * When set, POST `/api/broadcasts/:id/send` and `/send-segment` require header `X-Broadcast-Send-Secret`
     * with the same value (second factor against accidental or stolen-admin mass send).
     */
    BROADCAST_SEND_SECRET?: string;
    /**
     * `1` / `true`: refuse mass send unless `BROADCAST_SEND_SECRET` is set (forces second factor configuration).
     */
    REQUIRE_BROADCAST_SEND_SECRET?: string;
    /**
     * Optional comma-separated host allowlist for automation `send_webhook` only.
     * Each entry: exact hostname (`hooks.slack.com`) or suffix (`.example.com`). When unset/empty, only SSRF/DNS checks apply.
     */
    AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS?: string;
    /**
     * `1` / `true`: automation `send_webhook` requires a non-empty `AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS` allowlist.
     */
    REQUIRE_AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS?: string;
    /**
     * Secret for rotating `channel_access_token` / `channel_secret` via PUT `/api/line-accounts/:id`
     * (send matching `X-Line-Account-Secrets-Write`).
     */
    LINE_ACCOUNT_SECRETS_WRITE_SECRET?: string;
    /**
     * `1` / `true`: allow credential rotation without `LINE_ACCOUNT_SECRETS_WRITE_SECRET` (insecure; dev only).
     */
    ALLOW_LINE_ACCOUNT_CREDENTIAL_PUT_WITHOUT_EXTRA_SECRET?: string;
    /**
     * `1` / `true`: with Cloudflare Access, only principals **without** an `admin_principal_roles` row
     * or listed as `owner` may create LINE accounts or rotate Messaging credentials; explicit `admin` is blocked.
     */
    REQUIRE_OWNER_DB_ROLE_FOR_LINE_CREDENTIALS?: string;
    /**
     * Optional AES-GCM key material (any string; SHA-256 → 256-bit key) for encrypting Google Calendar
     * `access_token`, `refresh_token`, and `api_key` in D1. When unset, tokens are stored as submitted (legacy).
     */
    CALENDAR_TOKEN_ENCRYPTION_SECRET?: string;
    /**
     * `1` / `true` / `yes` / `on`: when Cloudflare Access is enforced, require a row in `admin_principal_roles`
     * for the JWT email (no row → 403). While the table is empty, only `/api/admin/principal-roles` is allowed
     * so the first admin can bootstrap. Recommended for production Zero Trust deployments.
     */
    REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST?: string;
  } & LandingEnv;
};

const app = new Hono<Env>();

app.use('*', hostHeaderMiddleware);
app.use('*', cfBotGuardMiddleware);
app.use('*', securityHeadersMiddleware);
app.use('*', apiWriteContentTypeMiddleware);

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  if (!shouldApplyCorsForOriginHeader(origin)) {
    return next();
  }

  const allowedOrigins = new Set(buildAllowedOrigins(c.env));
  if (!isAllowedOrigin(origin, allowedOrigins)) {
    if (c.req.method === 'OPTIONS') {
      return c.json({ success: false, error: 'CORS origin denied' }, 403);
    }
    return next();
  }

  const sharedLineOrigin = isSharedLineHostedOrigin(origin);
  if (sharedLineOrigin && !isAllowedSharedLineCorsPath(new URL(c.req.url).pathname, c.req.method)) {
    if (c.req.method === 'OPTIONS') {
      return c.json({ success: false, error: 'CORS origin denied' }, 403);
    }
    return next();
  }

  c.header('Access-Control-Allow-Origin', origin);
  if (!sharedLineOrigin) {
    c.header('Access-Control-Allow-Credentials', 'true');
  }
  c.header('Access-Control-Allow-Headers', ACCESS_CONTROL_ALLOW_HEADERS);
  c.header('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
  c.header('Access-Control-Max-Age', '86400');
  c.header('Vary', 'Origin');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  return next();
});

// Optional Cloudflare Access gate (JWT) — same public paths as auth; runs first
app.use('*', cloudflareAccessMiddleware);

// Auth middleware — skips /webhook and /docs automatically
app.use('*', authMiddleware);

// Optional read-only role when Cloudflare Access email is mapped in D1 (admin_principal_roles)
app.use('*', adminRbacMiddleware);

// Mount route groups — MVP & Round 2
app.route('/', webhook);
app.route('/', authRoutes);
app.route('/', friends);
app.route('/', tags);
app.route('/', scenarios);
app.route('/', broadcasts);
app.route('/', users);
app.route('/', lineAccounts);
app.route('/', conversions);
app.route('/', affiliates);
app.route('/', openapi);
app.route('/', liffRoutes);

// Mount route groups — Round 3
app.route('/', webhooks);
app.route('/', calendar);
app.route('/', reminders);
app.route('/', scoring);
app.route('/', templates);
app.route('/', chats);
app.route('/', notifications);
app.route('/', stripe);
app.route('/', health);
app.route('/', automations);
app.route('/', richMenus);
app.route('/', trackedLinks);
app.route('/', forms);
app.route('/', adminPrincipalRolesRoutes);

const SHORT_LINK_LANDING_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

// Short link: /r/:ref → landing page with LINE open button
app.get('/r/:ref', async (c) => {
  const limited = await enforceRateLimit(c, {
    bucket: 'short-link-landing',
    db: c.env.DB,
    limit: SHORT_LINK_LANDING_RATE_LIMIT.limit,
    windowMs: SHORT_LINK_LANDING_RATE_LIMIT.windowMs,
  });
  if (limited) {
    return limited;
  }

  const ref = c.req.param('ref');
  const liffUrl = (c.env.LIFF_URL ?? '').trim();
  if (!liffUrl || liffUrl.includes('YOUR_LIFF_ID')) {
    return c.html(
      `<!DOCTYPE html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>設定エラー</title><body style="font-family:system-ui,-apple-system; padding:24px; line-height:1.6"><h1>設定エラー</h1><p>LIFF_URL が未設定です。Cloudflare Worker の Variables に <code>https://liff.line.me/&lt;LIFF_ID&gt;</code> を設定してください。</p></body></html>`,
    );
  }
  const target = `${liffUrl}?ref=${encodeURIComponent(ref)}`;

  return c.html(renderShortLinkLanding(c.env, target));
});

// 404 fallback
app.notFound((c) => c.json({ success: false, error: 'Not found' }, 404));

// Scheduled handler for cron triggers — runs for all active LINE accounts
async function scheduled(
  _event: ScheduledEvent,
  env: Env['Bindings'],
  _ctx: ExecutionContext,
): Promise<void> {
  const laOpts = lineAccountDbOptions(env);
  const dbAccounts = await getLineAccounts(env.DB, laOpts);
  await runScheduledJobs({
    db: env.DB,
    defaultAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    workerUrl: env.WORKER_URL,
    defaultLineChannelId: env.LINE_CHANNEL_ID,
    dbAccounts,
    lineAccountDbOptions: laOpts,
  });
}

export default {
  fetch: app.fetch,
  scheduled,
};
