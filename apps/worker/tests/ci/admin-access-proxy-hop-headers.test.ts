import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const hopSrc = readFileSync(
  join(repoRoot, 'apps/admin-access-proxy-worker/src/hop-headers.ts'),
  'utf8',
);

describe('admin-access-proxy hop-by-hop header stripping', () => {
  it('lists Transfer-Encoding / TE / Trailer / Upgrade / proxy hop headers (RFC 7230)', () => {
    for (const h of [
      'transfer-encoding',
      'te',
      'trailer',
      'upgrade',
      'proxy-authorization',
      'proxy-authenticate',
      'keep-alive',
    ]) {
      expect(hopSrc).toMatch(new RegExp(`['"]${h}['"]`, 'i'));
    }
  });
});
