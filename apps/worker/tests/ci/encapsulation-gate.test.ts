import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('encapsulation gate (changeability)', () => {
  it('scripts/check-encapsulation.mjs exits 0 (same as pnpm harness step)', () => {
    const script = join(repoRoot, 'scripts/check-encapsulation.mjs');
    expect(() => {
      execFileSync(process.execPath, [script], {
        cwd: repoRoot,
        stdio: 'pipe',
        encoding: 'utf8',
      });
    }).not.toThrow();
  });
});
