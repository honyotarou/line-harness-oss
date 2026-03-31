import { Hono } from 'hono';
import { getLineAccounts } from '@line-crm/db';
import { authMiddleware } from './middleware/auth.js';
import { buildAllowedOrigins, isAllowedOrigin } from './services/cors-policy.js';
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

export type Env = {
  Bindings: {
    DB: D1Database;
    LINE_CHANNEL_SECRET: string;
    LINE_CHANNEL_ACCESS_TOKEN: string;
    API_KEY: string;
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
  } & LandingEnv;
};

const app = new Hono<Env>();

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  if (!origin) {
    return next();
  }

  const allowedOrigins = new Set(buildAllowedOrigins(c.env));
  if (!isAllowedOrigin(origin, allowedOrigins)) {
    if (c.req.method === 'OPTIONS') {
      return c.json({ success: false, error: 'CORS origin denied' }, 403);
    }
    return next();
  }

  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  c.header('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
  c.header('Access-Control-Max-Age', '86400');
  c.header('Vary', 'Origin');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  return next();
});

// Auth middleware — skips /webhook and /docs automatically
app.use('*', authMiddleware);

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

// Short link: /r/:ref → landing page with LINE open button
app.get('/r/:ref', (c) => {
  const ref = c.req.param('ref');
  const liffUrl = c.env.LIFF_URL || 'https://liff.line.me/2009554425-4IMBmLQ9';
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
  const dbAccounts = await getLineAccounts(env.DB);
  await runScheduledJobs({
    db: env.DB,
    defaultAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    workerUrl: env.WORKER_URL,
    dbAccounts,
  });
}

export default {
  fetch: app.fetch,
  scheduled,
};
