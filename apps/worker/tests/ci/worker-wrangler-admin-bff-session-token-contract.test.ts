import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Deploy contract: admin UI behind same-site `/api/lh-upstream` (admin-access-proxy) often cannot
 * persist `lh_admin_session` Set-Cookie from the upstream API host — POST /api/auth/login must be
 * able to return `sessionToken` in JSON when operators set INCLUDE_SESSION_TOKEN_IN_LOGIN_BODY=1.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const wrangler = readFileSync(join(repoRoot, 'apps/worker/wrangler.toml'), 'utf8');

describe('worker wrangler admin BFF / sessionToken contract', () => {
  it('declares INCLUDE_SESSION_TOKEN_IN_LOGIN_BODY in [vars] with a safe default', () => {
    expect(wrangler).toMatch(/^INCLUDE_SESSION_TOKEN_IN_LOGIN_BODY = "0"\s*$/m);
  });

  it('documents admin-access-proxy / lh-upstream next to that var', () => {
    const idx = wrangler.indexOf('INCLUDE_SESSION_TOKEN_IN_LOGIN_BODY');
    expect(idx).toBeGreaterThan(-1);
    const window = wrangler.slice(Math.max(0, idx - 800), idx + 120);
    expect(window).toMatch(/admin-access-proxy|lh-upstream/);
    expect(window).toMatch(/sessionToken/);
  });
});
