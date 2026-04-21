import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const workflow = readFileSync(join(repoRoot, '.github/workflows/deploy-worker.yml'), 'utf8');

describe('deploy-worker workflow operational hints', () => {
  it('documents scoped API tokens and D1 migration note', () => {
    expect(workflow).toMatch(/scoped to this Worker/i);
    expect(workflow).toMatch(/admin_principal_roles/);
    expect(workflow).toMatch(/D1 migrations/i);
  });

  it('runs on every push to main so CI reapplies GitHub secrets to Cloudflare (no path filter)', () => {
    expect(workflow).toMatch(/workflow_dispatch/);
    expect(workflow).toMatch(/^\s*push:/m);
    expect(workflow).toMatch(/branches:\s*\[\s*main\s*\]/);
    expect(workflow).not.toMatch(/paths:/);
    expect(workflow).toMatch(/GITHUB_TOKEN.*chain/i);
  });

  it('documents secrets, OpenAPI lockdown, host allowlist, Access, and Bot Management', () => {
    expect(workflow).toMatch(/wrangler secret put/i);
    expect(workflow).toMatch(/DISABLE_PUBLIC_OPENAPI/);
    expect(workflow).toMatch(/ALLOWED_HOSTNAMES/);
    expect(workflow).toMatch(/REQUIRE_CLOUDFLARE_ACCESS_JWT/);
    expect(workflow).toMatch(/MIN_CF_BOT_SCORE/);
    expect(workflow).toMatch(/Bot Management/i);
    expect(workflow).toMatch(/MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID/);
    expect(workflow).toMatch(/BROADCAST_SEND_SECRET/);
    expect(workflow).toMatch(/REQUIRE_ADMIN_SESSION_SECRET/);
    expect(workflow).toMatch(/CLOUDFLARE_ACCESS_TRUSTED_SERVICE_CLIENT_IDS/);
    expect(workflow).toMatch(/LH_SESSION_TOKEN_IN_LOGIN_BODY/);
    expect(workflow).toMatch(/AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS/);
    expect(workflow).toMatch(/SKIP_CI_AUTOMATION_WEBHOOK_ALLOWLIST_CHECK/);
    expect(workflow).toMatch(/WORKER_LINE_CRM_IMAGES_BUCKET_NAME/);
  });

  it('fails HTTPS deploys when Access is enforced but service token allowlist is missing', () => {
    expect(workflow).toMatch(
      /Missing GitHub Secret for HTTPS deploy: CLOUDFLARE_ACCESS_TRUSTED_SERVICE_CLIENT_IDS/,
    );
    expect(workflow).toMatch(/admin-access-proxy/i);
  });
});
