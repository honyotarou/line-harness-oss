import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Deploy / merge contract: same-origin Access bootstrap must stay wired end-to-end.
 * If production still returns 401 + `{"success":false,"error":"Unauthorized"}` (no `code`) on
 * `GET …/api/auth/access-bootstrap`, the live Worker build predates this wiring — redeploy.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const authRoutes = readFileSync(join(repoRoot, 'apps/worker/src/routes/auth.ts'), 'utf8');
const authPaths = readFileSync(join(repoRoot, 'apps/worker/src/services/auth-paths.ts'), 'utf8');
const handoff = readFileSync(
  join(repoRoot, 'apps/worker/src/services/auth-access-bootstrap-handoff.ts'),
  'utf8',
);
const returnTo = readFileSync(
  join(repoRoot, 'apps/worker/src/services/auth-access-bootstrap-return-to.ts'),
  'utf8',
);
const webBootstrapStart = readFileSync(
  join(repoRoot, 'apps/web/src/lib/admin-access-bootstrap-start.ts'),
  'utf8',
);
const webLoginPage = readFileSync(join(repoRoot, 'apps/web/src/app/login/page.tsx'), 'utf8');

describe('auth access-bootstrap source contract', () => {
  it('mounts GET /api/auth/access-bootstrap on auth routes', () => {
    expect(authRoutes).toMatch(/\/api\/auth\/access-bootstrap/);
    expect(authRoutes).toMatch(/respondAuthAccessBootstrapGet/);
  });

  it('exempts GET access-bootstrap from bearer auth and still requires Access JWT', () => {
    expect(authPaths).toMatch(/\/api\/auth\/access-bootstrap/);
    expect(authPaths).toMatch(/method === 'GET' && path === '\/api\/auth\/access-bootstrap'/);
    expect(authPaths).toMatch(/logical === '\/api\/auth\/access-bootstrap' && method === 'GET'/);
  });

  it('keeps handoff redirect + returnTo sanitizer', () => {
    expect(handoff).toMatch(/sanitizeAccessBootstrapReturnTo/);
    expect(handoff).toMatch(/302/);
    expect(returnTo).toMatch(/sanitizeAccessBootstrapReturnTo/);
    expect(returnTo).toMatch(/\.\./);
  });

  it('web login uses access-bootstrap (not session) for Access top-level navigation', () => {
    expect(webBootstrapStart).toMatch(/\/api\/auth\/access-bootstrap/);
    expect(webBootstrapStart).toMatch(/buildAdminAccessBootstrapStartHref/);
    expect(webLoginPage).toMatch(/buildAdminAccessBootstrapStartHref/);
    expect(webLoginPage).not.toMatch(/\/api\/auth\/session\?returnTo=/);
  });
});
