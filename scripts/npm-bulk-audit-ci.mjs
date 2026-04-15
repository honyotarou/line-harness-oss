#!/usr/bin/env node
/**
 * CI dependency audit using npm's bulk advisory API.
 * Replaces `pnpm audit` while registry legacy audit endpoints return 410
 * (pnpm/pnpm#11265, npm registry retirement of /-/npm/v1/security/audits).
 *
 * Usage: node scripts/npm-bulk-audit-ci.mjs [--audit-level=high]
 * Mirrors `pnpm audit --audit-level=<level>` exit semantics for that level.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function parseArgs(argv) {
  let auditLevel = 'high';
  for (const a of argv) {
    if (a.startsWith('--audit-level=')) {
      auditLevel = a.slice('--audit-level='.length).toLowerCase();
    }
  }
  if (!(auditLevel in SEVERITY_RANK)) {
    console.error(`Unknown --audit-level=${auditLevel} (use low|moderate|high|critical)`);
    process.exit(2);
  }
  return { auditLevel };
}

/** @returns {Generator<string, void, void>} */
function* packageKeysFromLockText(text) {
  const docs = text.split(/\n---\s*\n/);
  for (const doc of docs) {
    const lines = doc.split('\n');
    let inPackages = false;
    for (const line of lines) {
      if (/^packages:\s*$/.test(line)) {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
          inPackages = false;
          continue;
        }
        const m = line.match(/^  ((?:'[^']+'|"[^"]+"|[^:]+)):\s*(?:#.*)?$/);
        if (m) {
          let key = m[1];
          if (
            (key.startsWith("'") && key.endsWith("'")) ||
            (key.startsWith('"') && key.endsWith('"'))
          ) {
            key = key.slice(1, -1);
          }
          if (key.includes('@')) {
            yield key;
          }
        }
      }
    }
  }
}

function parseNameVersion(key) {
  const at = key.lastIndexOf('@');
  if (at <= 0) {
    return null;
  }
  const name = key.slice(0, at);
  const version = key.slice(at + 1);
  if (!name || !version || version.startsWith('link:') || version.startsWith('workspace:')) {
    return null;
  }
  return { name, version };
}

function buildBulkPayload(text) {
  /** @type {Map<string, Set<string>>} */
  const byName = new Map();
  for (const key of packageKeysFromLockText(text)) {
    const nv = parseNameVersion(key);
    if (!nv) {
      continue;
    }
    if (!semver.valid(nv.version)) {
      continue;
    }
    let set = byName.get(nv.name);
    if (!set) {
      set = new Set();
      byName.set(nv.name, set);
    }
    set.add(nv.version);
  }
  const payload = {};
  for (const [name, versions] of byName) {
    payload[name] = [...versions].sort();
  }
  return payload;
}

async function main() {
  const { auditLevel } = parseArgs(process.argv.slice(2));
  const minRank = SEVERITY_RANK[auditLevel];

  const lockPath = join(ROOT, 'pnpm-lock.yaml');
  const lockText = readFileSync(lockPath, 'utf8');
  const payload = buildBulkPayload(lockText);
  const names = Object.keys(payload);
  if (names.length === 0) {
    console.error('No semver entries found in pnpm-lock.yaml packages: sections.');
    process.exit(2);
  }

  const res = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error(`npm bulk advisory API error ${res.status}: ${t}`);
    process.exit(2);
  }

  /** @type {Record<string, Array<Record<string, unknown>>>} */
  const advisoriesByPkg = await res.json();

  /** @type {Array<{ pkg: string; version: string; title: string; severity: string; url?: string }>} */
  const hits = [];

  for (const [pkg, advisories] of Object.entries(advisoriesByPkg)) {
    if (!Array.isArray(advisories)) {
      continue;
    }
    const versions = payload[pkg];
    if (!versions) {
      continue;
    }
    for (const adv of advisories) {
      const sevRaw = typeof adv.severity === 'string' ? adv.severity.toLowerCase() : 'low';
      const rank = SEVERITY_RANK[sevRaw] ?? 1;
      if (rank < minRank) {
        continue;
      }
      const range = typeof adv.vulnerable_versions === 'string' ? adv.vulnerable_versions : '';
      if (!range) {
        continue;
      }
      for (const version of versions) {
        try {
          if (semver.satisfies(version, range, { includePrerelease: true })) {
            hits.push({
              pkg,
              version,
              title: String(adv.title ?? ''),
              severity: sevRaw,
              url: typeof adv.url === 'string' ? adv.url : undefined,
            });
          }
        } catch {
          // ignore malformed ranges
        }
      }
    }
  }

  if (hits.length > 0) {
    console.error(
      `Dependency audit failed: ${hits.length} finding(s) at or above severity "${auditLevel}".`,
    );
    for (const h of hits.slice(0, 50)) {
      console.error(
        `  ${h.pkg}@${h.version} [${h.severity}] ${h.title}${h.url ? ` (${h.url})` : ''}`,
      );
    }
    if (hits.length > 50) {
      console.error(`  ... and ${hits.length - 50} more`);
    }
    process.exit(1);
  }

  console.log(
    `npm bulk advisory scan OK (${names.length} packages, min severity to fail: ${auditLevel}).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
