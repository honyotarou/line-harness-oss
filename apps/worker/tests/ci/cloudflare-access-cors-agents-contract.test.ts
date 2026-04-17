import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const agents = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8');
const preflightPolicy = readFileSync(
  join(repoRoot, 'apps/worker/src/services/cloudflare-access-preflight-policy.ts'),
  'utf8',
);

describe('AGENTS.md ↔ official Access CORS preflight doc', () => {
  it('links Allow preflighted requests and Configure response to preflight (Option 2)', () => {
    expect(agents).toContain('allow-preflighted-requests');
    expect(agents).toContain('configure-response-to-preflight-requests');
  });

  it('keeps official Bypass anchor for readers but states repo does not use Access CORS Option 1', () => {
    expect(agents).toContain('bypass-options-requests-to-origin');
    expect(agents).toContain('本リポジトリでは CORS の「Bypass options requests to origin」');
  });

  it('separates Policies Bypass for static assets from CORS Bypass options to origin', () => {
    expect(agents).toContain('CORS 設定の「Bypass options requests to origin」とは別物');
  });
});

describe('cloudflare-access-preflight-policy.ts ↔ repo policy', () => {
  it('references official Allow preflighted requests URL and rejects Option 1 for this repo', () => {
    expect(preflightPolicy).toContain('allow-preflighted-requests');
    expect(preflightPolicy).toContain('does not use Access CORS Option 1');
  });
});
