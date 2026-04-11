/**
 * 攻撃者視点のレビュー → テストで仕様固定（バッチ 51–100）。
 * clampIntInRange / shared safe-json / stored-line-message / outbound-url / liff-redirect 等。
 */
import { describe, expect, it } from 'vitest';
import { tryParseJsonObjectForPreview } from '@line-crm/shared';

async function storedMsg(type: string, content: string, opts?: { flexAltFallback?: string }) {
  const { buildMessageFromStoredContent } = await import(
    '../../src/services/stored-line-message.js'
  );
  return buildMessageFromStoredContent(type, content, opts);
}

describe('攻撃者サイクル 51–100（セキュリティバッチ）', () => {
  it('cycle 51: clampIntInRange clamps above max', async () => {
    const { clampIntInRange } = await import('../../src/services/query-limits.js');
    expect(clampIntInRange('9999', 60, 15, 180)).toBe(180);
  });

  it('cycle 52: clampIntInRange raises below min', async () => {
    const { clampIntInRange } = await import('../../src/services/query-limits.js');
    expect(clampIntInRange('-100', 60, 15, 180)).toBe(15);
  });

  it('cycle 53: clampIntInRange NaN uses fallback clamped into range', async () => {
    const { clampIntInRange } = await import('../../src/services/query-limits.js');
    expect(clampIntInRange('x', 60, 15, 180)).toBe(60);
  });

  it('cycle 54: clampIntInRange undefined uses fallback', async () => {
    const { clampIntInRange } = await import('../../src/services/query-limits.js');
    expect(clampIntInRange(undefined, 9, 0, 23)).toBe(9);
  });

  it('cycle 55: clampIntInRange empty string is invalid and uses fallback', async () => {
    const { clampIntInRange } = await import('../../src/services/query-limits.js');
    expect(clampIntInRange('', 60, 15, 180)).toBe(60);
  });

  it('cycle 56: clampIntInRange floors fractional values', async () => {
    const { clampIntInRange } = await import('../../src/services/query-limits.js');
    expect(clampIntInRange('22.9', 60, 15, 180)).toBe(22);
  });

  it('cycle 57: clampIntInRange exact min boundary', async () => {
    const { clampIntInRange } = await import('../../src/services/query-limits.js');
    expect(clampIntInRange('15', 60, 15, 180)).toBe(15);
  });

  it('cycle 58: clampIntInRange exact max boundary', async () => {
    const { clampIntInRange } = await import('../../src/services/query-limits.js');
    expect(clampIntInRange('180', 60, 15, 180)).toBe(180);
  });

  it('cycle 59: clampIntInRange fallback below min is lifted to min', async () => {
    const { clampIntInRange } = await import('../../src/services/query-limits.js');
    expect(clampIntInRange('bad', 5, 10, 100)).toBe(10);
  });

  it('cycle 60: clampIntInRange fallback above max is capped', async () => {
    const { clampIntInRange } = await import('../../src/services/query-limits.js');
    expect(clampIntInRange('bad', 500, 0, 24)).toBe(24);
  });

  it('cycle 61: tryParseJsonObjectForPreview null for invalid JSON', () => {
    expect(tryParseJsonObjectForPreview('{')).toBeNull();
  });

  it('cycle 62: tryParseJsonObjectForPreview null for JSON array', () => {
    expect(tryParseJsonObjectForPreview('[1]')).toBeNull();
  });

  it('cycle 63: tryParseJsonObjectForPreview null for primitive JSON', () => {
    expect(tryParseJsonObjectForPreview('"s"')).toBeNull();
  });

  it('cycle 64: tryParseJsonObjectForPreview accepts plain object', () => {
    expect(tryParseJsonObjectForPreview('{"a":1}')).toEqual({ a: 1 });
  });

  it('cycle 65: tryParseJsonObjectForPreview empty string is null', () => {
    expect(tryParseJsonObjectForPreview('')).toBeNull();
  });

  it('cycle 66: image with only originalContentUrl string falls back to text', async () => {
    const m = await storedMsg(
      'image',
      JSON.stringify({ originalContentUrl: 'https://example.com/o.jpg' }),
    );
    expect(m.type).toBe('text');
  });

  it('cycle 67: image with only previewImageUrl string falls back to text', async () => {
    const m = await storedMsg(
      'image',
      JSON.stringify({ previewImageUrl: 'https://example.com/p.jpg' }),
    );
    expect(m.type).toBe('text');
  });

  it('cycle 68: flex altText from footer text node', async () => {
    const m = await storedMsg(
      'flex',
      JSON.stringify({
        type: 'bubble',
        footer: { type: 'box', contents: [{ type: 'text', text: 'FootAlt' }] },
      }),
    );
    expect(m.type).toBe('flex');
    if (m.type === 'flex') expect(m.altText).toBe('FootAlt');
  });

  it('cycle 69: flex header text used as alt', async () => {
    const m = await storedMsg(
      'flex',
      JSON.stringify({
        type: 'bubble',
        header: { type: 'box', contents: [{ type: 'text', text: 'HeadAlt' }] },
        body: { type: 'box', contents: [] },
      }),
    );
    expect(m.type).toBe('flex');
    if (m.type === 'flex') expect(m.altText).toBe('HeadAlt');
  });

  function deepBoxNest(depth: number): Record<string, unknown> {
    if (depth <= 0) {
      return { type: 'box', contents: [{ type: 'text', text: 'TooDeep' }] };
    }
    return { type: 'box', contents: [deepBoxNest(depth - 1)] };
  }

  it('cycle 70: flex text beyond extract depth uses alt fallback', async () => {
    const m = await storedMsg('flex', JSON.stringify({ type: 'bubble', body: deepBoxNest(25) }), {
      flexAltFallback: 'FallbackAlt',
    });
    expect(m.type).toBe('flex');
    if (m.type === 'flex') expect(m.altText).toBe('FallbackAlt');
  });

  it('cycle 71: flex strips empty text nodes before send shape', async () => {
    const m = await storedMsg(
      'flex',
      JSON.stringify({
        type: 'bubble',
        body: {
          type: 'box',
          contents: [
            { type: 'text', text: '   ' },
            { type: 'text', text: 'Real' },
          ],
        },
      }),
    );
    expect(m.type).toBe('flex');
    if (m.type === 'flex') {
      const body = m.contents.body as Record<string, unknown>;
      const contents = body.contents as unknown[];
      expect(contents.some((c) => (c as { text?: string }).text === '   ')).toBe(false);
    }
  });

  it('cycle 72: isSafeHttpsOutboundUrl rejects CGNAT 100.64.0.0/10', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://100.64.1.1/x')).toBe(false);
  });

  it('cycle 73: isSafeHttpsOutboundUrl rejects 192.168.0.0/16', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://192.168.0.1/')).toBe(false);
  });

  it('cycle 74: isSafeHttpsOutboundUrl rejects 172.16.0.0/12', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://172.20.0.1/')).toBe(false);
  });

  it('cycle 75: isSafeHttpsOutboundUrl rejects URL with embedded credentials', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://user:pass@example.com/')).toBe(false);
  });

  it('cycle 76: isSafeHttpsOutboundUrl rejects IPv6 link-local', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://[fe80::1]/')).toBe(false);
  });

  it('cycle 77: isSafeHttpsOutboundUrl rejects IPv4-mapped loopback in IPv6', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://[::ffff:127.0.0.1]/')).toBe(false);
  });

  it('cycle 78: isSafeHttpsOutboundUrl allows public IPv4', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://1.1.1.1/path')).toBe(true);
  });

  it('cycle 79: resolveSafeRedirectUrl rejects absolute http URL', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('http://client.example/ok', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBeNull();
  });

  it('cycle 80: resolveSafeRedirectUrl rejects unknown https origin', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('https://evil.example/', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBeNull();
  });

  it('cycle 81: resolveSafeRedirectUrl allows LINE origin', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('https://access.line.me/oauth2/path', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBe('https://access.line.me/oauth2/path');
  });

  it('cycle 82: resolveSafeRedirectUrl trims whitespace on path', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('  /path  ', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBe('https://client.example/path');
  });

  it('cycle 83: resolveSafeRedirectUrl empty string is null', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('   ', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBeNull();
  });

  it('cycle 84: resolveSafeRedirectUrl without WEB_URL or WORKER_URL rejects path-only', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(resolveSafeRedirectUrl('/ok', {})).toBeNull();
  });

  it('cycle 85: parseStringArrayJson rejects mixed-type array', async () => {
    const { parseStringArrayJson } = await import('../../src/services/safe-json.js');
    expect(parseStringArrayJson('["a",1]')).toBeNull();
  });

  it('cycle 86: parseStringArrayJson rejects empty string (throws path → null)', async () => {
    const { parseStringArrayJson } = await import('../../src/services/safe-json.js');
    expect(parseStringArrayJson('')).toBeNull();
  });

  it('cycle 87: tryParseJsonLoose returns null for empty input', async () => {
    const { tryParseJsonLoose } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonLoose('')).toBeNull();
    expect(tryParseJsonLoose(undefined)).toBeNull();
  });

  it('cycle 88: tryParseJson preserves fallback for invalid JSON', async () => {
    const { tryParseJson } = await import('../../src/services/safe-json.js');
    expect(tryParseJson('{', { k: 1 })).toEqual({ k: 1 });
  });

  it('cycle 89: unsafeSendWebhookUrlInActions ignores non-array input', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(unsafeSendWebhookUrlInActions({ url: 'https://127.0.0.1/' })).toBeNull();
  });

  it('cycle 90: unsafeSendWebhookUrlInActions skips non-object entries', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(
      unsafeSendWebhookUrlInActions([
        null,
        { type: 'send_webhook', params: { url: 'https://example.com/h' } },
      ]),
    ).toBeNull();
  });

  it('cycle 91: flex altText truncates long text', async () => {
    const long = 'x'.repeat(150);
    const m = await storedMsg(
      'flex',
      JSON.stringify({
        type: 'bubble',
        body: { type: 'box', contents: [{ type: 'text', text: long }] },
      }),
    );
    expect(m.type).toBe('flex');
    if (m.type === 'flex') expect(m.altText.length).toBeLessThanOrEqual(100);
  });

  it('cycle 92: image empty object falls back to text', async () => {
    const m = await storedMsg('image', '{}');
    expect(m.type).toBe('text');
  });

  it('cycle 93: image JSON null falls back to text', async () => {
    const m = await storedMsg('image', 'null');
    expect(m.type).toBe('text');
  });

  it('cycle 94: isSafeHttpsOutboundUrl rejects bare hostname without scheme', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('example.com')).toBe(false);
  });

  it('cycle 95: isSafeHttpsOutboundUrl rejects ws: scheme', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('wss://example.com/')).toBe(false);
  });

  it('cycle 96: parseStringArrayJson double-encoded string form', async () => {
    const { parseStringArrayJson } = await import('../../src/services/safe-json.js');
    expect(parseStringArrayJson('"[\\"a\\",\\"b\\"]"')).toEqual(['a', 'b']);
  });

  it('cycle 97: tryParseJsonRecord rejects JSON null', async () => {
    const { tryParseJsonRecord } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonRecord('null')).toBeNull();
  });

  it('cycle 98: tryParseJsonArray returns array for valid JSON array', async () => {
    const { tryParseJsonArray } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonArray('[1,2]')).toEqual([1, 2]);
  });

  it('cycle 99: isSafeHttpsOutboundUrl rejects whitespace-only URL', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('   ')).toBe(false);
  });

  it('cycle 100: resolveSafeRedirectUrl rejects path that escapes origin', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('/\\evil', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBeNull();
  });
});
