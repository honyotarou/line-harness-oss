import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const workflow = readFileSync(
  join(repoRoot, '.github/workflows/sync-admin-access-proxy-secrets.yml'),
  'utf8',
);

describe('sync-admin-access-proxy-secrets workflow', () => {
  it('is manual-only so secret edits can trigger a Cloudflare sync without code push', () => {
    expect(workflow).toMatch(/workflow_dispatch/);
    expect(workflow).not.toMatch(/^\s*push:/m);
  });

  it('requires CF Access proxy token secrets and uses wrangler secret put', () => {
    expect(workflow).toMatch(/ADMIN_ACCESS_PROXY_CF_ACCESS_CLIENT_ID/);
    expect(workflow).toMatch(/ADMIN_ACCESS_PROXY_CF_ACCESS_CLIENT_SECRET/);
    expect(workflow).toMatch(/wrangler secret put CF_ACCESS_CLIENT_ID/);
    expect(workflow).toMatch(/wrangler secret put CF_ACCESS_CLIENT_SECRET/);
    expect(workflow).toMatch(/::error::/);
  });
});
