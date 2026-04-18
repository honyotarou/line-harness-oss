import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const safeLinkSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'safe-link.tsx'),
  'utf8',
);

describe('SafeLink (RSC prefetch vs Cloudflare Access)', () => {
  it('defaults prefetch to false at the Next Link boundary', () => {
    expect(safeLinkSrc).toMatch(/\{\s*prefetch\s*=\s*false\s*,/);
    expect(safeLinkSrc).toMatch(/<NextLink\s+prefetch=\{prefetch\}/);
  });
});
