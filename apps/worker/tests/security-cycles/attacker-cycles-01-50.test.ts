/**
 * 攻撃者視点のレビュー → テストで仕様固定（バッチ 1–50）。
 * 実装は stored-line-message / query-limits / safe-json / outbound-url / liff-redirect 等に対応。
 */
import { describe, expect, it } from 'vitest';

async function storedMsg(type: string, content: string, opts?: { flexAltFallback?: string }) {
  const { buildMessageFromStoredContent } = await import(
    '../../src/services/stored-line-message.js'
  );
  return buildMessageFromStoredContent(type, content, opts);
}

describe('攻撃者サイクル 1–50（セキュリティバッチ）', () => {
  it('cycle 1: flex payload that is a JSON array must not become type flex', async () => {
    const m = await storedMsg('flex', '[]');
    expect(m.type).toBe('text');
  });

  it('cycle 2: flex payload that is JSON null must not become type flex', async () => {
    const m = await storedMsg('flex', 'null');
    expect(m.type).toBe('text');
  });

  it('cycle 3: flex payload that is a JSON string must not become type flex', async () => {
    const m = await storedMsg('flex', '"hi"');
    expect(m.type).toBe('text');
  });

  it('cycle 4: flex payload that is a JSON number must not become type flex', async () => {
    const m = await storedMsg('flex', '1');
    expect(m.type).toBe('text');
  });

  it('cycle 5: valid flex object stays flex with altText fallback', async () => {
    const m = await storedMsg(
      'flex',
      JSON.stringify({ type: 'bubble', body: { type: 'box', contents: [] } }),
      { flexAltFallback: 'X' },
    );
    expect(m.type).toBe('flex');
    if (m.type === 'flex') expect(m.altText).toBe('X');
  });

  it('cycle 6: image JSON array falls back to text (no bogus LINE image call)', async () => {
    const m = await storedMsg('image', '[]');
    expect(m.type).toBe('text');
  });

  it('cycle 7: image JSON missing URL fields falls back to text', async () => {
    const m = await storedMsg('image', JSON.stringify({ foo: 1 }));
    expect(m.type).toBe('text');
  });

  it('cycle 8: image with string URLs stays image', async () => {
    const m = await storedMsg(
      'image',
      JSON.stringify({
        originalContentUrl: 'https://example.com/o.jpg',
        previewImageUrl: 'https://example.com/p.jpg',
      }),
    );
    expect(m.type).toBe('image');
  });

  it('cycle 9: invalid image JSON falls back to text', async () => {
    const m = await storedMsg('image', '{');
    expect(m.type).toBe('text');
  });

  it('cycle 10: unknown message type is treated as text', async () => {
    const m = await storedMsg('sticker', '{}');
    expect(m.type).toBe('text');
  });

  it('cycle 11: text type echoes content without parse', async () => {
    const m = await storedMsg('text', '{"not":"parsed"}');
    expect(m.type).toBe('text');
    if (m.type === 'text') expect(m.text).toBe('{"not":"parsed"}');
  });

  it('cycle 12: flex object with text node uses extracted altText', async () => {
    const m = await storedMsg(
      'flex',
      JSON.stringify({
        type: 'bubble',
        body: { type: 'box', contents: [{ type: 'text', text: 'HelloAlt' }] },
      }),
    );
    expect(m.type).toBe('flex');
    if (m.type === 'flex') expect(m.altText).toBe('HelloAlt');
  });

  it('cycle 13: clampListLimit caps above max', async () => {
    const { clampListLimit } = await import('../../src/services/query-limits.js');
    expect(clampListLimit('99999', 50, 200)).toBe(200);
  });

  it('cycle 14: clampListLimit uses fallback for NaN', async () => {
    const { clampListLimit } = await import('../../src/services/query-limits.js');
    expect(clampListLimit('nope', 50, 200)).toBe(50);
  });

  it('cycle 15: clampListLimit rejects zero/negative', async () => {
    const { clampListLimit } = await import('../../src/services/query-limits.js');
    expect(clampListLimit('0', 50, 200)).toBe(50);
    expect(clampListLimit('-5', 50, 200)).toBe(50);
  });

  it('cycle 16: clampListLimit floors floats', async () => {
    const { clampListLimit } = await import('../../src/services/query-limits.js');
    expect(clampListLimit('3.9', 10, 200)).toBe(3);
  });

  it('cycle 17: clampOffset negative becomes 0', async () => {
    const { clampOffset } = await import('../../src/services/query-limits.js');
    expect(clampOffset('-10', 1000)).toBe(0);
  });

  it('cycle 18: clampOffset caps at max', async () => {
    const { clampOffset } = await import('../../src/services/query-limits.js');
    expect(clampOffset('9999999', 500_000)).toBe(500_000);
  });

  it('cycle 19: clampOffset NaN becomes 0', async () => {
    const { clampOffset } = await import('../../src/services/query-limits.js');
    expect(clampOffset('bad', 100)).toBe(0);
  });

  it('cycle 20: clampListLimit respects small max bound', async () => {
    const { clampListLimit } = await import('../../src/services/query-limits.js');
    expect(clampListLimit('5', 10, 5)).toBe(5);
  });

  it('cycle 21: tryParseJsonArray returns [] for non-array JSON object', async () => {
    const { tryParseJsonArray } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonArray('{}')).toEqual([]);
  });

  it('cycle 22: tryParseJsonArray returns [] for invalid JSON', async () => {
    const { tryParseJsonArray } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonArray('{x')).toEqual([]);
  });

  it('cycle 23: tryParseJsonRecord rejects JSON array', async () => {
    const { tryParseJsonRecord } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonRecord('[]')).toBeNull();
  });

  it('cycle 24: tryParseJsonRecord accepts plain object', async () => {
    const { tryParseJsonRecord } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonRecord('{"a":1}')).toEqual({ a: 1 });
  });

  it('cycle 25: tryParseJsonLoose parses primitives', async () => {
    const { tryParseJsonLoose } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonLoose('true')).toBe(true);
  });

  it('cycle 26: parseStringArrayJson rejects numeric array', async () => {
    const { parseStringArrayJson } = await import('../../src/services/safe-json.js');
    expect(parseStringArrayJson('[1,2]')).toBeNull();
  });

  it('cycle 27: parseStringArrayJson accepts string array', async () => {
    const { parseStringArrayJson } = await import('../../src/services/safe-json.js');
    expect(parseStringArrayJson('["a","b"]')).toEqual(['a', 'b']);
  });

  it('cycle 28: isSafeHttpsOutboundUrl rejects javascript: scheme not applicable (https only)', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('javascript:alert(1)')).toBe(false);
  });

  it('cycle 29: isSafeHttpsOutboundUrl rejects data: URLs', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('data:text/html,<script>')).toBe(false);
  });

  it('cycle 30: isSafeHttpsOutboundUrl rejects IPv6 loopback', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://[::1]:443/x')).toBe(false);
  });

  it('cycle 31: isSafeHttpsOutboundUrl rejects metadata IP (AWS)', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://169.254.169.254/')).toBe(false);
  });

  it('cycle 32: isSafeHttpsOutboundUrl rejects link-local 169.254.x', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://169.254.1.1/')).toBe(false);
  });

  it('cycle 33: unsafeSendWebhookUrlInActions rejects missing url', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(unsafeSendWebhookUrlInActions([{ type: 'send_webhook', params: {} }])).toMatch(
      /not allowed|required|url/i,
    );
  });

  it('cycle 34: unsafeSendWebhookUrlInActions rejects empty url', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(
      unsafeSendWebhookUrlInActions([{ type: 'send_webhook', params: { url: '   ' } }]),
    ).toMatch(/not allowed|required|url/i);
  });

  it('cycle 35: resolveSafeRedirectUrl blocks javascript:', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('javascript:alert(1)', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBeNull();
  });

  it('cycle 36: resolveSafeRedirectUrl blocks data:', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('data:text/html,hi', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBeNull();
  });

  it('cycle 37: resolveSafeRedirectUrl blocks //evil protocol-relative', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('//evil.example/path', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBeNull();
  });

  it('cycle 38: resolveSafeRedirectUrl allows same-origin path with query', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('/ok?x=1', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBe('https://client.example/ok?x=1');
  });

  it('cycle 39: tryParseJson rejects empty with fallback', async () => {
    const { tryParseJson } = await import('../../src/services/safe-json.js');
    expect(tryParseJson('', { x: 1 })).toEqual({ x: 1 });
  });

  it('cycle 40: parseStringArrayJson rejects object', async () => {
    const { parseStringArrayJson } = await import('../../src/services/safe-json.js');
    expect(parseStringArrayJson('{}')).toBeNull();
  });

  it('cycle 41: isSafeHttpsOutboundUrl allows normal public host', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://hooks.zapier.com/hooks/catch/123/abc/')).toBe(true);
  });

  it('cycle 42: flex empty object still flex (LINE may reject at API — type is structurally flex)', async () => {
    const m = await storedMsg('flex', '{}', { flexAltFallback: 'F' });
    expect(m.type).toBe('flex');
  });

  it('cycle 43: image URLs must be strings not numbers', async () => {
    const m = await storedMsg(
      'image',
      JSON.stringify({ originalContentUrl: 1, previewImageUrl: 2 }),
    );
    expect(m.type).toBe('text');
  });

  it('cycle 44: clampListLimit undefined raw uses fallback', async () => {
    const { clampListLimit } = await import('../../src/services/query-limits.js');
    expect(clampListLimit(undefined, 25, 100)).toBe(25);
  });

  it('cycle 45: clampOffset undefined is 0', async () => {
    const { clampOffset } = await import('../../src/services/query-limits.js');
    expect(clampOffset(undefined, 100)).toBe(0);
  });

  it('cycle 46: tryParseJsonRecord null for primitive JSON string', async () => {
    const { tryParseJsonRecord } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonRecord('"hello"')).toBeNull();
  });

  it('cycle 47: unsafeSendWebhookUrlInActions allows multiple actions if all URLs safe', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(
      unsafeSendWebhookUrlInActions([
        { type: 'send_webhook', params: { url: 'https://a.example/h' } },
        { type: 'send_webhook', params: { url: 'https://b.example/h' } },
      ]),
    ).toBeNull();
  });

  it('cycle 48: first unsafe send_webhook URL in list wins', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(
      unsafeSendWebhookUrlInActions([
        { type: 'send_webhook', params: { url: 'https://example.com/ok' } },
        { type: 'send_webhook', params: { url: 'https://127.0.0.1/bad' } },
      ]),
    ).toMatch(/not allowed/);
  });

  it('cycle 49: resolveSafeRedirectUrl blocks ftp:', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('ftp://files.example/x', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBeNull();
  });

  it('cycle 50: isSafeHttpsOutboundUrl rejects port on loopback-style hostname localhost', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://localhost:8080/')).toBe(false);
  });
});
