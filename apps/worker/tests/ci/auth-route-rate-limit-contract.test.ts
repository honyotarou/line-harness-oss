import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const authSrc = readFileSync(join(repoRoot, 'apps/worker/src/routes/auth.ts'), 'utf8');

describe('auth route rate limits (SSO edge / AuthGuard friendly)', () => {
  it('keeps login bucket above naive 5/min to tolerate edge reload loops while still bounded', () => {
    expect(authSrc).toMatch(/LOGIN_RATE_LIMIT\s*=\s*\{\s*limit:\s*2[0-9]/);
  });

  it('keeps session check bucket comfortably above per-navigation AuthGuard usage', () => {
    expect(authSrc).toMatch(
      /SESSION_CHECK_RATE_LIMIT\s*=\s*\{\s*limit:\s*(?:[12]\d{2}|[3-9]\d{2})/,
    );
  });
});
