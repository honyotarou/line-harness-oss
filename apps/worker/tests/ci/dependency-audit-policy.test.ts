import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('dependency audit policy', () => {
  it('root package.json defines audit:ci using pnpm audit', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.['audit:ci']).toBeDefined();
    expect(pkg.scripts?.['audit:ci']).toContain('pnpm audit');
  });
});
