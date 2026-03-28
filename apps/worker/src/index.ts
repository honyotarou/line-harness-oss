import { Hono } from 'hono';
import { getLineAccounts } from '@line-crm/db';
import { authMiddleware } from './middleware/auth.js';
import { buildAllowedOrigins, isAllowedOrigin } from './services/cors-policy.js';
import { runScheduledJobs } from './services/scheduler.js';
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
    ALLOWED_ORIGINS?: string;
    STRIPE_WEBHOOK_SECRET?: string;
  };
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

  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LINE Harness</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Hiragino Sans',system-ui,sans-serif;background:#0d1117;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{text-align:center;max-width:400px;width:90%;padding:48px 24px}
h1{font-size:28px;font-weight:800;margin-bottom:8px}
.sub{font-size:14px;color:rgba(255,255,255,0.5);margin-bottom:40px}
.btn{display:block;width:100%;padding:18px;border:none;border-radius:12px;font-size:18px;font-weight:700;text-decoration:none;text-align:center;color:#fff;background:#06C755;transition:opacity .15s}
.btn:active{opacity:.85}
.note{font-size:12px;color:rgba(255,255,255,0.3);margin-top:24px;line-height:1.6}
</style>
</head>
<body>
<div class="card">
<h1>LINE Harness</h1>
<p class="sub">L社 / U社 の無料代替 OSS</p>
<a href="${target}" class="btn">LINE で体験する</a>
<p class="note">友だち追加するだけで<br>ステップ配信・フォーム・自動返信を体験できます</p>
</div>
</body>
</html>`);
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
