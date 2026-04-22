import { describe, expect, it } from 'vitest';

describe('sanitizeLandingEnvHtmlFragmentAllowBrOnly', () => {
  it('returns fallback when value is empty', async () => {
    const { sanitizeLandingEnvHtmlFragmentAllowBrOnly } = await import(
      '../../src/services/landing-env-html-fragment.js'
    );
    expect(sanitizeLandingEnvHtmlFragmentAllowBrOnly(undefined, 'a<br>b')).toBe('a<br>b');
    expect(sanitizeLandingEnvHtmlFragmentAllowBrOnly('   ', 'a<br>b')).toBe('a<br>b');
  });

  it('escapes script and other tags', async () => {
    const { sanitizeLandingEnvHtmlFragmentAllowBrOnly } = await import(
      '../../src/services/landing-env-html-fragment.js'
    );
    const out = sanitizeLandingEnvHtmlFragmentAllowBrOnly(
      '<img src=x onerror=alert(1)>',
      'fallback',
    );
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    expect(out).toContain('&gt;');
  });

  it('preserves only br boundaries between escaped segments', async () => {
    const { sanitizeLandingEnvHtmlFragmentAllowBrOnly } = await import(
      '../../src/services/landing-env-html-fragment.js'
    );
    const out = sanitizeLandingEnvHtmlFragmentAllowBrOnly('a<BR/>b<br>c', 'fallback');
    expect(out).toBe('a<br>b<br>c');
  });

  it('accepts permissive br spacing', async () => {
    const { sanitizeLandingEnvHtmlFragmentAllowBrOnly } = await import(
      '../../src/services/landing-env-html-fragment.js'
    );
    expect(sanitizeLandingEnvHtmlFragmentAllowBrOnly('x < br / > y', 'f')).toBe('x<br>y');
    expect(sanitizeLandingEnvHtmlFragmentAllowBrOnly('x<br />y', 'f')).toBe('x<br>y');
  });
});
