import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workerRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const wranglerToml = readFileSync(join(workerRoot, 'wrangler.toml'), 'utf8');
const localExamplePath = join(workerRoot, 'wrangler.local.toml.example');
const localExample = readFileSync(localExamplePath, 'utf8');

describe('wrangler config (no third-party demo hosts in repo defaults)', () => {
  it('wrangler.toml [vars] does not commit another maintainer production URLs', () => {
    expect(wranglerToml).not.toMatch(/kenkou1359/);
    expect(wranglerToml).not.toMatch(/line-harness-oss-web-blush/);
    expect(wranglerToml).not.toMatch(/line-crm-api\.workers\.dev/);
  });

  it('wrangler.toml defaults WORKER_URL / WEB_URL to Cloudflare + Vercel placeholders', () => {
    expect(wranglerToml).toMatch(/WORKER_URL = "https:\/\/YOUR_SUBDOMAIN\.workers\.dev"/);
    expect(wranglerToml).toMatch(/WEB_URL = "https:\/\/YOUR_PROJECT\.vercel\.app"/);
    expect(wranglerToml).toMatch(/LIFF_URL = "https:\/\/liff\.line\.me\/YOUR_LIFF_ID"/);
  });

  it('wrangler.local.toml.example documents standalone config and D1 placeholder', () => {
    expect(localExample).toMatch(/-c wrangler\.local\.toml/);
    expect(localExample).not.toMatch(/line-crm-api\.workers\.dev/);
    expect(localExample).toMatch(/YOUR_SUBDOMAIN\.workers\.dev/);
    expect(localExample).toMatch(/YOUR_D1_DATABASE_ID/);
  });

  it('wrangler.toml comments document public OpenAPI enable/disable vars', () => {
    expect(wranglerToml).toMatch(/ENABLE_PUBLIC_OPENAPI/);
    expect(wranglerToml).toMatch(/DISABLE_PUBLIC_OPENAPI/);
  });

  it('wrangler.toml comments document optional Bot Management vars', () => {
    expect(wranglerToml).toMatch(/MIN_CF_BOT_SCORE/);
    expect(wranglerToml).toMatch(/REQUIRE_CF_BOT_SIGNAL/);
  });

  it('wrangler.toml comments document multi-account, LIFF state, session secret, broadcast send guard, and automation webhook hosts', () => {
    expect(wranglerToml).toMatch(/MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID/);
    expect(wranglerToml).toMatch(/REQUIRE_LIFF_STATE_SECRET/);
    expect(wranglerToml).toMatch(/ALLOW_LIFF_OAUTH_API_KEY_FALLBACK/);
    expect(wranglerToml).toMatch(/LINE_ACCOUNT_SECRETS_KEY/);
    expect(wranglerToml).toMatch(/REQUIRE_ADMIN_SESSION_SECRET/);
    expect(wranglerToml).toMatch(/BROADCAST_SEND_SECRET/);
    expect(wranglerToml).toMatch(/REQUIRE_BROADCAST_SEND_SECRET/);
    expect(wranglerToml).toMatch(/LINE_ACCOUNT_SECRETS_WRITE_SECRET/);
    expect(wranglerToml).toMatch(/REQUIRE_OWNER_DB_ROLE_FOR_LINE_CREDENTIALS/);
    expect(wranglerToml).toMatch(/AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS/);
    expect(wranglerToml).toMatch(/REQUIRE_AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS/);
  });

  it('wrangler.toml documents optional admin RBAC table and Cloudflare ops hygiene', () => {
    expect(wranglerToml).toMatch(/admin_principal_roles/);
    expect(wranglerToml).toMatch(/REQUIRE_ADMIN_PRINCIPAL_ALLOWLIST/);
    expect(wranglerToml).toMatch(/least-privilege/);
  });
});
