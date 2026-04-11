import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('root D1 helper scripts use wrangler.local.toml when present', () => {
  it.each([
    'd1-apply-010.sh',
    'd1-apply-011.sh',
    'd1-apply-012.sh',
    'd1-apply-013.sh',
    'd1-apply-015.sh',
    'd1-pre-010-check.sh',
  ])('%s passes -c wrangler.local.toml', (name) => {
    const raw = readFileSync(join(repoRoot, 'scripts', name), 'utf8');
    expect(raw).toMatch(/wrangler\.local\.toml/);
    expect(raw).toMatch(/WR_EXTRA|-c wrangler\.local\.toml/);
  });
});
