import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const wrangler = readFileSync(
  join(repoRoot, 'apps/admin-access-proxy-worker/wrangler.toml'),
  'utf8',
);

describe('admin-access-proxy wrangler (fork-friendly placeholders)', () => {
  it('does not commit maintainer-specific production hosts', () => {
    expect(wrangler).not.toMatch(/familybondnet/);
    expect(wrangler).not.toMatch(/kenkou1359/);
  });

  it('documents injectable upstream placeholder (routes appended in CI when secrets set)', () => {
    expect(wrangler).toMatch(/YOUR_UPSTREAM_API_ORIGIN/);
    expect(wrangler).toMatch(/ADMIN_ACCESS_PROXY_ROUTE_PATTERN/);
  });
});
