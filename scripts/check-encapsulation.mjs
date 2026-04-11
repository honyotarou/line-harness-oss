#!/usr/bin/env node
/**
 * Encapsulation / changeability gates (no extra npm deps).
 * - Worker: application/ stays HTTP-free; thin routes stay thin; no LINE OAuth hosts in routes/.
 * - Web: api/catalog fragments only depend on client + @line-crm/shared; client does not import catalog.
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

// ── Worker: routes/*.ts — no LINE platform HTTP endpoints (belong in application/services) ──
const routesDir = path.join(ROOT, 'apps/worker/src/routes');

/**
 * Max lines per route file (HTTP adapter). Caps = snapshot + headroom; tighten in PRs after
 * extracting to application/*.ts. New route files MUST add an entry here.
 */
const ROUTE_LINE_CAPS = {
  'admin-principal-roles.ts': 123,
  'affiliates.ts': 246,
  'auth.ts': 251,
  'automations.ts': 253,
  'broadcasts.ts': 409,
  'calendar.ts': 212,
  'chats.ts': 378,
  'conversions.ts': 208,
  'forms.ts': 497,
  'friends.ts': 498,
  'health.ts': 174,
  'line-accounts.ts': 253,
  'liff.ts': 203,
  'notifications.ts': 224,
  'openapi.ts': 92,
  'reminders.ts': 305,
  'rich-menus.ts': 297,
  'scenarios.ts': 462,
  'scoring.ts': 207,
  'stripe.ts': 211,
  'tags.ts': 96,
  'templates.ts': 141,
  'tracked-links.ts': 262,
  'users.ts': 240,
  'webhook.ts': 129,
  'webhooks.ts': 384,
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

// ── Web: client.ts must not depend on catalog ──────────────────────────────
const clientTs = path.join(ROOT, 'apps/web/src/lib/api/client.ts');
if (fs.existsSync(clientTs)) {
  const src = readUtf8(clientTs);
  if (/from\s+['"][^'"]*catalog[^'"]*['"]/.test(src)) {
    errors.push(
      'apps/web/src/lib/api/client.ts: must not import catalog/ (base layer vs resource API).',
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

// ── Report ─────────────────────────────────────────────────────────────────
if (errors.length) {
  console.error('== harness: encapsulation check FAILED ==\n');
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log('== harness: encapsulation check OK ==');
