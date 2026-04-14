import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const workflow = readFileSync(
  join(repoRoot, '.github/workflows/deploy-admin-access-proxy.yml'),
  'utf8',
);

describe('deploy-admin-access-proxy workflow', () => {
  it('documents GitHub Secrets for service token sync after deploy', () => {
    expect(workflow).toMatch(/ADMIN_ACCESS_PROXY_CF_ACCESS_CLIENT_ID/);
    expect(workflow).toMatch(/ADMIN_ACCESS_PROXY_CF_ACCESS_CLIENT_SECRET/);
    expect(workflow).toMatch(/wrangler secret put CF_ACCESS_CLIENT_ID/);
    expect(workflow).toMatch(/wrangler secret put CF_ACCESS_CLIENT_SECRET/);
  });

  it('reuses Cloudflare API token and deploys from apps/admin-access-proxy-worker', () => {
    expect(workflow).toMatch(/CLOUDFLARE_API_TOKEN/);
    expect(workflow).toMatch(/apps\/admin-access-proxy-worker/);
    expect(workflow).toMatch(/command: deploy/);
  });
});
