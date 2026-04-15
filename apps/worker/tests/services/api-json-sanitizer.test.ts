import { describe, expect, it } from 'vitest';

describe('api-json-sanitizer', () => {
  it('escapes HTML metacharacters in flat strings', async () => {
    const { escapeHtmlTextForJsonApi } = await import('../../src/services/api-json-sanitizer.js');
    expect(escapeHtmlTextForJsonApi(`a<b>"c"'d`)).toBe('a&lt;b&gt;&quot;c&quot;&#39;d');
  });

  it('recursively escapes string leaves in nested JSON-like structures', async () => {
    const { deepEscapeHtmlStringLeaves } = await import('../../src/services/api-json-sanitizer.js');
    const out = deepEscapeHtmlStringLeaves({
      a: '<x>',
      n: 1,
      nested: [{ label: '<img>' }],
    }) as Record<string, unknown>;
    expect(out.a).toBe('&lt;x&gt;');
    expect(out.n).toBe(1);
    expect((out.nested as { label: string }[])[0].label).toBe('&lt;img&gt;');
  });

  it('skips prototype pollution keys', async () => {
    const { deepEscapeHtmlStringLeaves } = await import('../../src/services/api-json-sanitizer.js');
    const malicious = JSON.parse(
      '{"__proto__":{"x":1},"safe":"<y>","constructor":{"name":"z"}}',
    ) as Record<string, unknown>;
    const out = deepEscapeHtmlStringLeaves(malicious) as Record<string, unknown>;
    expect(out.__proto__).toBeUndefined();
    expect(out.constructor).toBeUndefined();
    expect(out.safe).toBe('&lt;y&gt;');
  });
});
