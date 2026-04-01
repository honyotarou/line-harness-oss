import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workerRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const wranglerToml = readFileSync(join(workerRoot, 'wrangler.toml'), 'utf8');
const localExample = readFileSync(join(workerRoot, 'wrangler.local.toml.example'), 'utf8');

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

  it('wrangler.local.toml.example does not use public demo Worker as WORKER_URL', () => {
    expect(localExample).not.toMatch(/line-crm-api\.workers\.dev/);
    expect(localExample).toMatch(/YOUR_SUBDOMAIN\.workers\.dev/);
  });
});
