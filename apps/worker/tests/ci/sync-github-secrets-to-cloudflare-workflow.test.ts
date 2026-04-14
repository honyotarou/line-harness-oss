import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const workflow = readFileSync(
  join(repoRoot, '.github/workflows/sync-github-secrets-to-cloudflare.yml'),
  'utf8',
);

describe('sync-github-secrets-to-cloudflare workflow', () => {
  it('runs on every push to main (no path filter) so any commit retriggers Cloudflare deploys', () => {
    expect(workflow).toMatch(/branches:\s*\[\s*main\s*\]/);
    expect(workflow).toMatch(/^\s*push:/m);
    expect(workflow).not.toMatch(/paths:/);
  });

  it('dispatches deploy-worker and deploy-admin-access-proxy via gh with actions:write', () => {
    expect(workflow).toMatch(/gh workflow run deploy-worker\.yml/);
    expect(workflow).toMatch(/gh workflow run deploy-admin-access-proxy\.yml/);
    expect(workflow).toMatch(/actions:\s*write/);
  });
});
