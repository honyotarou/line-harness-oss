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

  it('requires Cloudflare auth + proxy token secrets and uploads via wrangler-action', () => {
    expect(workflow).toMatch(/ADMIN_ACCESS_PROXY_CF_ACCESS_CLIENT_ID/);
    expect(workflow).toMatch(/ADMIN_ACCESS_PROXY_CF_ACCESS_CLIENT_SECRET/);
    expect(workflow).toMatch(/CLOUDFLARE_ACCOUNT_ID/);
    expect(workflow).toMatch(/cloudflare\/wrangler-action@v3/);
    expect(workflow).toMatch(/CF_ACCESS_CLIENT_ID/);
    expect(workflow).toMatch(/CF_ACCESS_CLIENT_SECRET/);
    expect(workflow).toMatch(/command:\s*whoami/);
    expect(workflow).toMatch(/::error::/);
  });
});
