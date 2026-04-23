#!/usr/bin/env node
/**
 * Encapsulation / changeability gates (no extra npm deps).
 *
 * Goal: approximate *necessary* layer rules (what must hold for the intended shape) plus a few
 * *sufficiency* proxies (things that commonly break encapsulation if unchecked). This script is
 * still not a full proof of architecture — behavior, security, and domain correctness stay in
 * tests — but passing it should mean:
 *
 * Worker
 * - application/*.ts: no routes/, no hono (use-cases stay HTTP-free).
 * - services/*.ts + middleware/*.ts: no routes/, no application/ (no upward/inward cycles).
 * - routes/*.ts: no literal LINE API/OAuth hosts; per-file line budget (thin adapters).
 * Web
 * - Outside lib/api: no imports of lib/api/catalog (facade is @/lib/api or client only).
 * - client.ts does not import catalog; catalog fragments only client + @line-crm/shared.
 * LIFF
 * - No fetch() to a literal http(s) URL; Worker origin flows through api-base / config.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/** @type {string[]} */
const errors = [];

function readUtf8(p) {
  return fs.readFileSync(p, 'utf8');
}

function lineCount(content) {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

/**
 * @param {string} dir
 * @param {(f: string) => boolean} filter
 * @returns {string[]}
 */
function listFilesRecursive(dir, filter) {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFilesRecursive(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

const fromRe = /from\s+['"]([^'"]+)['"]/g;

function importsInSource(src) {
  /** @type {string[]} */
  const mods = [];
  let m;
  const re = new RegExp(fromRe.source, 'g');
  while ((m = re.exec(src)) !== null) {
    mods.push(m[1]);
  }
  return mods;
}

/**
 * Relative import path contains a real `routes` or `application` directory segment
 * (e.g. `../routes/x`). Avoids false positives like `foo-routes`.
 * @param {string} mod
 * @param {string} segment
 */
function relativeImportHasPathSegment(mod, segment) {
  if (!mod.startsWith('.')) return false;
  const parts = mod.replace(/\\/g, '/').split('/');
  return parts.some((p) => p === segment);
}

function classNamesInSource(src) {
  const names = [];
  const re = /(?:^|\n)\s*(?:export\s+)?class\s+([A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    names.push(m[1]);
  }
  return names;
}

function interfaceNamesInSource(src) {
  const names = [];
  const re = /(?:^|\n)\s*(?:export\s+)?interface\s+([A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    names.push(m[1]);
  }
  return names;
}

// ── Worker: application/*.ts ───────────────────────────────────────────────
const appDir = path.join(ROOT, 'apps/worker/src/application');
for (const f of listFilesRecursive(appDir, (p) => p.endsWith('.ts'))) {
  const src = readUtf8(f);
  const rel = path.relative(ROOT, f);
  if (
    /\/routes\//.test(src) ||
    src.includes("from '../routes/") ||
    src.includes('from "../routes/')
  ) {
    errors.push(`${rel}: application must not import routes/ (keep use-cases HTTP-free).`);
  }
  if (/from\s+['"]hono/.test(src)) {
    errors.push(`${rel}: application must not import hono (keep adapters in routes/).`);
  }
}

// ── Worker: services/*.ts + middleware/*.ts — no routes/ or application/ (layer DAG) ────────
for (const { dir, label } of [
  { dir: path.join(ROOT, 'apps/worker/src/services'), label: 'services' },
  { dir: path.join(ROOT, 'apps/worker/src/middleware'), label: 'middleware' },
]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of listFilesRecursive(dir, (p) => p.endsWith('.ts'))) {
    const rel = path.relative(ROOT, f);
    const src = readUtf8(f);
    for (const mod of importsInSource(src)) {
      if (relativeImportHasPathSegment(mod, 'routes')) {
        errors.push(`${rel}: ${label} must not import routes/ (HTTP adapters stay in routes/).`);
      }
      if (relativeImportHasPathSegment(mod, 'application')) {
        errors.push(
          `${rel}: ${label} must not import application/ (use-cases sit above services/middleware).`,
        );
      }
    }
  }
}

// ── Worker: routes/*.ts — no LINE platform HTTP endpoints (belong in application/services) ──
const routesDir = path.join(ROOT, 'apps/worker/src/routes');

/**
 * Max lines per route file (HTTP adapter). Caps = snapshot + headroom; tighten in PRs after
 * extracting to application/*.ts. New route files MUST add an entry here.
 */
const ROUTE_LINE_CAPS = {
  'admin-audit.ts': 90,
  'admin-principal-roles.ts': 123,
  'affiliates.ts': 246,
  'auto-replies.ts': 175,
  'auth.ts': 251,
  'automations.ts': 310,
  'broadcasts-ops.ts': 180,
  'broadcasts.ts': 240,
  'calendar.ts': 230,
  'chats.ts': 430,
  'conversions.ts': 208,
  'conversions.events.ts': 160,
  'conversions.points.ts': 120,
  'env-probe.ts': 55,
  'forms.ts': 260,
  'friends.ts': 498,
  'images.ts': 200,
  'health.ts': 174,
  'inbox.ts': 80,
  'line-accounts.ts': 300,
  'ad-platforms.ts': 280,
  'liff.ts': 203,
  'notifications.ts': 270,
  'openapi.ts': 92,
  'operators.ts': 190,
  'reminders.ts': 220,
  'rich-menus.ts': 330,
  'scenarios.ts': 462,
  'scoring.ts': 207,
  'stripe.ts': 140,
  // Tags: LINE account scope + multi-account create validation (pentest H3).
  'tags.ts': 100,
  'templates.ts': 141,
  // Tracked links: admin CRUD + public /t redirect with multi-tenant friend/tag/scenario alignment (pentest C3).
  'tracked-links.ts': 360,
  'traffic-pools.ts': 240,
  'users.ts': 240,
  'webhook.ts': 129,
  'webhooks.ts': 455,
  'webhooks.incoming-admin.ts': 250,
  'webhooks.outgoing-admin.ts': 255,
  'webhooks.receive.ts': 130,
};

const routeFiles = listFilesRecursive(routesDir, (p) => p.endsWith('.ts'));
for (const f of routeFiles) {
  const name = path.basename(f);
  const rel = path.relative(ROOT, f);
  const src = readUtf8(f);

  if (src.includes('api.line.me') || src.includes('access.line.me')) {
    errors.push(
      `${rel}: routes must not call LINE OAuth/API hosts directly; use application/ or services/.`,
    );
  }

  if (!Object.hasOwn(ROUTE_LINE_CAPS, name)) {
    errors.push(
      `${rel}: add "${name}" to ROUTE_LINE_CAPS in scripts/check-encapsulation.mjs (new routes need an explicit line budget).`,
    );
    continue;
  }
  const maxLines = ROUTE_LINE_CAPS[name];
  const n = lineCount(src);
  if (n > maxLines) {
    errors.push(
      `${rel}: ${n} lines (max ${maxLines}). Move logic to apps/worker/src/application/*.ts or services/ and keep the route as wiring — or raise the cap in a focused PR.`,
    );
  }
}

// ── Web: outside lib/api — no direct catalog imports (facade = @/lib/api or client) ────────
const webSrcDir = path.join(ROOT, 'apps/web/src');
const webApiLibPrefix = path.join(ROOT, 'apps/web/src/lib/api');
if (fs.existsSync(webSrcDir)) {
  for (const f of listFilesRecursive(webSrcDir, (p) => p.endsWith('.ts') || p.endsWith('.tsx'))) {
    if (f === webApiLibPrefix || f.startsWith(`${webApiLibPrefix}${path.sep}`)) continue;
    const rel = path.relative(ROOT, f);
    for (const mod of importsInSource(readUtf8(f))) {
      if (
        mod.includes('lib/api/catalog') ||
        mod === '@/lib/api/catalog' ||
        mod.startsWith('@/lib/api/catalog/')
      ) {
        errors.push(
          `${rel}: import "${mod}" — use @/lib/api or client.js instead of catalog/ outside lib/api.`,
        );
      }
    }
  }
}

// ── Web: next/link only inside SafeLink (RSC prefetch vs Cloudflare Access edge) ─────────
const safeLinkSingleFile = path.join(ROOT, 'apps/web/src/components/safe-link.tsx');
if (fs.existsSync(webSrcDir)) {
  for (const f of listFilesRecursive(webSrcDir, (p) => p.endsWith('.ts') || p.endsWith('.tsx'))) {
    if (path.normalize(f) === path.normalize(safeLinkSingleFile)) continue;
    const rel = path.relative(ROOT, f);
    if (/from\s+['"]next\/link['"]/.test(readUtf8(f))) {
      errors.push(
        `${rel}: do not import next/link directly — use @/components/safe-link (default prefetch=false avoids Access login CORS on RSC *.txt?_rsc= viewport prefetch).`,
      );
    }
  }
}

// ── Web: client.ts must not depend on catalog ──────────────────────────────
const clientTs = path.join(ROOT, 'apps/web/src/lib/api/client.ts');
if (fs.existsSync(clientTs)) {
  const src = readUtf8(clientTs);
  if (/from\s+['"][^'"]*catalog[^'"]*['"]/.test(src)) {
    errors.push(
      'apps/web/src/lib/api/client.ts: must not import catalog/ (base layer vs resource API).',
    );
  }
  if (!src.includes("loc.replace('/login')")) {
    errors.push(
      "apps/web/src/lib/api/client.ts: non-auth Access edge redirect must use location.replace('/login') (avoid reloading the dashboard and re-firing parallel /api/*).",
    );
  }
  if (!src.includes('tryClaimAdminAccessDocumentRedirect')) {
    errors.push(
      'apps/web/src/lib/api/client.ts: must call tryClaimAdminAccessDocumentRedirect before document navigation on Access-shaped non-auth redirects (parallel fetch storm guard).',
    );
  }
}

// ── Web: catalog/*.ts fragments — only shared + ../client.js ─────────────
const catalogDir = path.join(ROOT, 'apps/web/src/lib/api/catalog');
for (const f of listFilesRecursive(catalogDir, (p) => p.endsWith('.ts'))) {
  const base = path.basename(f);
  if (base === 'index.ts') continue;
  const rel = path.relative(ROOT, f);
  for (const mod of importsInSource(readUtf8(f))) {
    const ok =
      mod === '../client.js' || mod.startsWith('@line-crm/shared') || mod === '@line-crm/shared';
    if (!ok) {
      errors.push(
        `${rel}: catalog fragment imports "${mod}" — only @line-crm/shared and ../client.js allowed (keeps API surface modular).`,
      );
    }
  }
}

// ── Web: catalog/index.ts — only ./ sibling modules ────────────────────────
const catIndex = path.join(catalogDir, 'index.ts');
if (fs.existsSync(catIndex)) {
  for (const mod of importsInSource(readUtf8(catIndex))) {
    if (!mod.startsWith('./') || !mod.endsWith('.js')) {
      errors.push(
        `apps/web/src/lib/api/catalog/index.ts: import "${mod}" — only relative ./\*.js siblings allowed.`,
      );
    }
  }
}

// ── LIFF: no literal absolute URL in fetch() (Worker origin via api-base) ────────────────
const liffSrcDir = path.join(ROOT, 'apps/liff/src');
if (fs.existsSync(liffSrcDir)) {
  for (const f of listFilesRecursive(
    liffSrcDir,
    (p) => p.endsWith('.ts') && !p.endsWith('.test.ts'),
  )) {
    if (path.basename(f) === 'env.d.ts') continue;
    const rel = path.relative(ROOT, f);
    const src = readUtf8(f);
    if (/fetch\s*\(\s*['"`]https?:\/\//.test(src)) {
      errors.push(
        `${rel}: LIFF must not fetch() a literal http(s) URL; use API_BASE from api-base.js.`,
      );
    }
  }
}

// ── TypeScript design gate: no class / interface declarations in app code ───────────────────
for (const dir of [
  path.join(ROOT, 'packages/shared/src'),
  path.join(ROOT, 'packages/sdk/src'),
  path.join(ROOT, 'packages/line-sdk/src'),
  path.join(ROOT, 'apps/web/src'),
  path.join(ROOT, 'apps/worker/src'),
]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of listFilesRecursive(
    dir,
    (p) =>
      (p.endsWith('.ts') || p.endsWith('.tsx')) &&
      !p.endsWith('.d.ts') &&
      !p.includes('/out/') &&
      !p.includes('/coverage/') &&
      !p.includes('.test.'),
  )) {
    const rel = path.relative(ROOT, f);
    const src = readUtf8(f);
    const classNames = classNamesInSource(src);
    if (classNames.length > 0) {
      errors.push(
        `${rel}: class declaration(s) ${classNames.join(', ')} found; use functions + plain objects/Error values instead of classes.`,
      );
    }
    const interfaceNames = interfaceNamesInSource(src);
    if (interfaceNames.length > 0) {
      errors.push(
        `${rel}: interface declaration(s) ${interfaceNames.join(', ')} found; prefer Readonly type aliases so structural typing remains explicit.`,
      );
    }
  }
}

// ── Docs + Worker: Cloudflare Access preflight contract (AGENTS.md ↔ middleware) ─────────────
const agentsMd = path.join(ROOT, 'AGENTS.md');
if (fs.existsSync(agentsMd)) {
  const agents = readUtf8(agentsMd);
  if (!agents.includes('shouldBypassCloudflareAccessJwtForCorsPreflight')) {
    errors.push(
      'AGENTS.md: must reference shouldBypassCloudflareAccessJwtForCorsPreflight (Worker CORS/Access contract).',
    );
  }
  if (!agents.includes('allow-preflighted-requests')) {
    errors.push(
      'AGENTS.md: must link to Cloudflare Allow preflighted requests (#allow-preflighted-requests).',
    );
  }
  if (!agents.includes('configure-response-to-preflight-requests')) {
    errors.push(
      'AGENTS.md: must link to Configure response to preflight requests (official Option 2).',
    );
  }
  if (!agents.includes('bypass-options-requests-to-origin')) {
    errors.push(
      'AGENTS.md: must still reference official Bypass options anchor (repo policy: do not use it).',
    );
  }
  if (!agents.includes('本リポジトリでは CORS の「Bypass options requests to origin」')) {
    errors.push(
      'AGENTS.md: must state repo policy — do not use Access CORS "Bypass options requests to origin" (Option 1).',
    );
  }
  if (!agents.includes('/api/lh-upstream/api/*')) {
    errors.push(
      'AGENTS.md: must document narrowing Access Application paths to /api/lh-upstream/api/* (same-origin Next RSC prefetch vs Access).',
    );
  }
  if (!agents.includes('*.txt?_rsc')) {
    errors.push(
      'AGENTS.md: must mention RSC prefetch (*.txt?_rsc) risk with Cloudflare Access path scope.',
    );
  }
  if (!agents.includes('CLOUDFLARE_ACCESS_AUDIENCE')) {
    errors.push(
      'AGENTS.md: must document CLOUDFLARE_ACCESS_AUDIENCE alignment with Access Application Audience (AUD) Tag.',
    );
  }
  if (!agents.includes('wrangler tail') || !agents.includes('requestId')) {
    errors.push(
      'AGENTS.md: must document wrangler tail triage using JSON requestId for admin API 500s.',
    );
  }
}
const cfAccessMw = path.join(ROOT, 'apps/worker/src/middleware/cloudflare-access.ts');
if (fs.existsSync(cfAccessMw)) {
  const src = readUtf8(cfAccessMw);
  if (!src.includes('cloudflare-access-preflight-policy')) {
    errors.push(
      'apps/worker/src/middleware/cloudflare-access.ts: must import cloudflare-access-preflight-policy (Access JWT skip for OPTIONS).',
    );
  }
  if (!src.includes('shouldBypassCloudflareAccessJwtForCorsPreflight')) {
    errors.push(
      'apps/worker/src/middleware/cloudflare-access.ts: must call shouldBypassCloudflareAccessJwtForCorsPreflight (no inline OPTIONS-only check).',
    );
  }
}

// ── Admin Access proxy Worker (browser same-origin BFF + service token) ───
const adminAccessProxyIndex = path.join(ROOT, 'apps/admin-access-proxy-worker/src/index.ts');
if (fs.existsSync(adminAccessProxyIndex)) {
  const src = readUtf8(adminAccessProxyIndex);
  if (!src.includes("redirect: 'manual'")) {
    errors.push(
      "apps/admin-access-proxy-worker/src/index.ts: upstream fetch must use redirect: 'manual' so Access login redirects are not auto-followed in the Worker.",
    );
  }
  if (!src.includes('isCloudflareAccessApplicationLoginRedirect')) {
    errors.push(
      'apps/admin-access-proxy-worker/src/index.ts: must use isCloudflareAccessApplicationLoginRedirect from @line-crm/shared (do not inline Access URL heuristics).',
    );
  }
  if (!src.includes('API Access did not accept the service token')) {
    errors.push(
      'apps/admin-access-proxy-worker/src/index.ts: must return the documented 502 JSON when upstream sends an Access interactive login redirect (browser must not see that Location).',
    );
  }
  if (!src.includes('rewriteSetCookieLineForAdminBrowserOrigin')) {
    errors.push(
      'apps/admin-access-proxy-worker/src/index.ts: must rewrite upstream Set-Cookie via rewriteSetCookieLineForAdminBrowserOrigin (@line-crm/shared) so admin cookies are not scoped to the upstream Worker hostname.',
    );
  }
}

// ── F1 regression guard: event-bus filter must be fail-closed ──────────────
// The pre-F1 filter `!rule.line_account_id || !lineAccountId || a.line_account_id === lineAccountId`
// was fail-OPEN: an undefined tenant id matched every scoped rule, so callers forgetting to
// forward lineAccountId leaked automations/notifications across tenants. The canonical filter
// is `tenantScopedRuleMatches(rule, lineAccountId)` in services/tenant-scoped-rule-filter.ts.
const eventBusPath = path.join(ROOT, 'apps/worker/src/services/event-bus.ts');
if (fs.existsSync(eventBusPath)) {
  const src = readUtf8(eventBusPath);
  // Forbid the old inline short-circuit pattern on scoped-rule filters.
  // Match either `!rule.line_account_id || !lineAccountId` or the snake/camel variants.
  const failOpen = /!\s*\w+\.line_account_id\s*\|\|\s*!\s*lineAccountId/;
  if (failOpen.test(src)) {
    errors.push(
      'apps/worker/src/services/event-bus.ts: fail-open tenant filter detected (`!rule.line_account_id || !lineAccountId ...`). Use `tenantScopedRuleMatches(rule, lineAccountId)` from services/tenant-scoped-rule-filter.ts (F1 regression guard).',
    );
  }
  // Require the helper import to survive even if someone rewrites the filter in a different shape.
  if (!src.includes('tenantScopedRuleMatches')) {
    errors.push(
      'apps/worker/src/services/event-bus.ts: must import `tenantScopedRuleMatches` (F1 contract — scoped rule filter lives in services/tenant-scoped-rule-filter.ts).',
    );
  }
}

// ── F1 regression guard: fireEventRespectingAutomationWebhookHosts callers forward tenant ──
// Every file that dispatches to the event bus must also reference `line_account_id` or
// `lineAccountId` somewhere (caller-side forwarding). An uncaller-aware dispatch passing only
// 4 positional args (db, eventType, payload, bindings) trips the fail-closed filter as intended,
// but also means scoped rules will silently not fire. The lint makes the forwarding deliberate.
const fireEventCallerDirs = [
  path.join(ROOT, 'apps/worker/src/routes'),
  path.join(ROOT, 'apps/worker/src/application'),
];
for (const dir of fireEventCallerDirs) {
  if (!fs.existsSync(dir)) continue;
  for (const f of listFilesRecursive(dir, (p) => p.endsWith('.ts') && !p.endsWith('.test.ts'))) {
    const rel = path.relative(ROOT, f);
    const src = readUtf8(f);
    if (!src.includes('fireEventRespectingAutomationWebhookHosts')) continue;
    // The helper module itself is allowed not to forward (it is the forwarder).
    if (rel === 'apps/worker/src/services/fire-event-outbound.ts') continue;
    if (!/(line_account_id|lineAccountId)/.test(src)) {
      errors.push(
        `${rel}: calls fireEventRespectingAutomationWebhookHosts but does not reference line_account_id / lineAccountId in the same file (F1 contract — forward the tenant to event-bus so scoped automations match).`,
      );
    }
  }
}

// ── F4/F5a regression guard: friend-addressed routes must use a scope guard ────────────────
// Any route that resolves a friend via `getFriendById` must also gate with one of the known
// scope helpers; otherwise cross-tenant reads/writes slip through (F4 = users/:id/link,
// F5a = scoring friend score). See services/friend-scope-guard.ts and services/admin-line-account-scope.ts.
const friendScopeGuardTokens = [
  'friendScopeGuardCheck',
  'jsonIfFriendOutOfScope',
  'resourceLineAccountVisibleInScope',
];
if (fs.existsSync(routesDir)) {
  for (const f of listFilesRecursive(routesDir, (p) => p.endsWith('.ts'))) {
    const rel = path.relative(ROOT, f);
    const src = readUtf8(f);
    if (!src.includes('getFriendById')) continue;
    const hasGuard = friendScopeGuardTokens.some((t) => src.includes(t));
    if (!hasGuard) {
      errors.push(
        `${rel}: route calls getFriendById but does not reference any friend scope guard (${friendScopeGuardTokens.join(' | ')}). Add friendScopeGuardCheck(scope, friend) from services/friend-scope-guard.ts (F4/F5a contract).`,
      );
    }
  }
}

// ── Rule D: migrations ↔ schema.sql drift ────────────────────────────────────
// For each migration's `ALTER TABLE X ADD COLUMN Y ...` and `CREATE TABLE [IF NOT EXISTS] X (...)`,
// confirm the canonical schema.sql reflects the change. Prevents F3-style drift (column added to
// a migration but forgotten in schema.sql, so new env-bootstrap diverges from migrated deployments).
//
// Intermediate recreate-pattern tables (suffixes like `_new`, `_old`, `__NNN`) are skipped —
// their final RENAME TO target is what must exist in schema.sql, which is checked separately.
const migrationsDir = path.join(ROOT, 'packages/db/migrations');
const schemaSqlPath = path.join(ROOT, 'packages/db/schema.sql');
if (fs.existsSync(migrationsDir) && fs.existsSync(schemaSqlPath)) {
  const schemaSrc = readUtf8(schemaSqlPath);

  /**
   * Extract the column list body of `CREATE TABLE [IF NOT EXISTS] <name> ( ... )` from SQL text.
   * Returns the parenthesized body (without outer parens), or null if the table is absent.
   */
  function extractCreateTableBody(sql, tableName) {
    const re = new RegExp(
      `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${tableName}\\s*\\(`,
      'i',
    );
    const m = re.exec(sql);
    if (!m) return null;
    // Walk forward tracking paren depth to find the matching `)`.
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < sql.length && depth > 0) {
      const ch = sql[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      i += 1;
    }
    if (depth !== 0) return null;
    return sql.slice(start, i - 1);
  }

  function columnExistsInBody(body, columnName) {
    // Column references in body look like `  <colname> TYPE ...,` at line start
    // (after optional leading whitespace). Match as word boundary to avoid substring hits.
    const re = new RegExp(`(^|\\n)\\s*${columnName}\\b`, 'i');
    return re.test(body);
  }

  // Intermediate rebuild-pattern tables: `_new` / `_old` suffix, plus recreate-suffix
  // styles like `__031` (purely numeric) or `__m025` (letter-prefixed). These are never
  // the long-term canonical shape, so schema.sql is not required to contain them.
  const isIntermediateTable = (name) => /(_new|_old|__[a-z]*\d+)$/i.test(name);

  const migrationFiles = listFilesRecursive(migrationsDir, (p) => p.endsWith('.sql')).sort();

  const addColumnRe = /ALTER\s+TABLE\s+([a-z_][a-z0-9_]*)\s+ADD\s+COLUMN\s+([a-z_][a-z0-9_]*)\b/gi;
  const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\s*\(/gi;
  const dropTableRe = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;
  const renameRe = /ALTER\s+TABLE\s+([a-z_][a-z0-9_]*)\s+RENAME\s+TO\s+([a-z_][a-z0-9_]*)/gi;

  // First pass: gather every table dropped across ALL migrations (so an earlier CREATE
  // is not flagged just because a later migration removed the table entirely, e.g.
  // admin_users dropped by 017).
  const globallyDroppedTables = new Set();
  for (const f of migrationFiles) {
    const clean = readUtf8(f)
      .split(/\r?\n/)
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
    let dm;
    dropTableRe.lastIndex = 0;
    while ((dm = dropTableRe.exec(clean)) !== null) {
      globallyDroppedTables.add(dm[1]);
    }
    let rm;
    renameRe.lastIndex = 0;
    while ((rm = renameRe.exec(clean)) !== null) {
      // `ALTER TABLE foo_new RENAME TO foo` means foo_new is consumed; treat as dropped.
      globallyDroppedTables.add(rm[1]);
    }
  }

  for (const f of migrationFiles) {
    const rel = path.relative(ROOT, f);
    const src = readUtf8(f);

    // Strip SQL comments to avoid false positives.
    const clean = src
      .split(/\r?\n/)
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');

    // Tables dropped in this migration — columns/tables may have been removed intentionally.
    const droppedTables = new Set();
    let dm;
    dropTableRe.lastIndex = 0;
    while ((dm = dropTableRe.exec(clean)) !== null) {
      droppedTables.add(dm[1]);
    }
    // Rename targets — the source is usually a `_new`/`_old` intermediate; the target is what
    // must exist in schema.sql. Track targets to cross-check.
    const renameTargets = new Set();
    let rm;
    renameRe.lastIndex = 0;
    while ((rm = renameRe.exec(clean)) !== null) {
      renameTargets.add(rm[2]);
    }

    // ADD COLUMN checks
    let am;
    addColumnRe.lastIndex = 0;
    while ((am = addColumnRe.exec(clean)) !== null) {
      const [, table, column] = am;
      if (droppedTables.has(table) || globallyDroppedTables.has(table)) continue;
      const body = extractCreateTableBody(schemaSrc, table);
      if (!body) {
        errors.push(
          `${rel}: migration adds column to table \`${table}\` but schema.sql has no CREATE TABLE for \`${table}\` (Rule D — schema.sql must reflect the migrated shape).`,
        );
        continue;
      }
      if (!columnExistsInBody(body, column)) {
        errors.push(
          `${rel}: migration adds \`${table}.${column}\` but schema.sql CREATE TABLE \`${table}\` does not list the column (Rule D — update packages/db/schema.sql alongside the migration).`,
        );
      }
    }

    // CREATE TABLE checks — new tables must also appear in schema.sql (excluding intermediates
    // and tables dropped later in migration history).
    let cm;
    createTableRe.lastIndex = 0;
    while ((cm = createTableRe.exec(clean)) !== null) {
      const table = cm[1];
      if (isIntermediateTable(table)) continue;
      if (globallyDroppedTables.has(table) && !renameTargets.has(table)) continue;
      if (!extractCreateTableBody(schemaSrc, table)) {
        errors.push(
          `${rel}: migration creates table \`${table}\` but schema.sql has no matching CREATE TABLE (Rule D — mirror new tables into packages/db/schema.sql).`,
        );
      }
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
if (errors.length) {
  console.error('== harness: encapsulation check FAILED ==\n');
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log('== harness: encapsulation check OK ==');
