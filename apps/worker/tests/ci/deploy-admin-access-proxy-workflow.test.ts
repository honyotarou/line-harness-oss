import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const workflow = readFileSync(
  join(repoRoot, '.github/workflows/deploy-admin-access-proxy.yml'),
  'utf8',
);
const proxyWrangler = readFileSync(
  join(repoRoot, 'apps/admin-access-proxy-worker/wrangler.toml'),
  'utf8',
);

describe('deploy-admin-access-proxy workflow', () => {
  it('documents GitHub Secrets for service token sync after deploy', () => {
    expect(workflow).toMatch(/ADMIN_ACCESS_PROXY_CF_ACCESS_CLIENT_ID/);
    expect(workflow).toMatch(/ADMIN_ACCESS_PROXY_CF_ACCESS_CLIENT_SECRET/);
    expect(workflow).toMatch(/proxy_cf/);
    expect(workflow).toMatch(/secrets:\s*\|\s*\n\s*CF_ACCESS_CLIENT_ID/);
    expect(workflow).toMatch(/CF_ACCESS_CLIENT_SECRET/);
  });

  it('reuses Cloudflare API token and deploys from apps/admin-access-proxy-worker', () => {
    expect(workflow).toMatch(/CLOUDFLARE_API_TOKEN/);
    expect(workflow).toMatch(/apps\/admin-access-proxy-worker/);
    expect(workflow).toMatch(/command: deploy/);
  });

  it('documents optional route and upstream injection secrets', () => {
    expect(workflow).toMatch(/ADMIN_ACCESS_PROXY_UPSTREAM_ORIGIN/);
    expect(workflow).toMatch(/ADMIN_ACCESS_PROXY_ROUTE_PATTERN/);
    expect(workflow).toMatch(/ADMIN_ACCESS_PROXY_ZONE_NAME/);
  });

  it('sed upstream injection target matches wrangler UPSTREAM_API_ORIGIN placeholder (fork + CI stay aligned)', () => {
    const needle = 'https://YOUR_UPSTREAM_API_ORIGIN';
    expect(proxyWrangler).toContain(`UPSTREAM_API_ORIGIN = "${needle}"`);
    expect(workflow).toContain(needle);
    expect(workflow).toContain("sed -i.bak 's|https://YOUR_UPSTREAM_API_ORIGIN|'");
  });

  it('fails manual runs when CF proxy token secrets are missing', () => {
    expect(workflow).toMatch(/workflow_dispatch/);
    expect(workflow).toMatch(/github.event_name/);
    expect(workflow).toMatch(/::error::/);
  });
});
