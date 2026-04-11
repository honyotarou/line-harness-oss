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
  });
});
