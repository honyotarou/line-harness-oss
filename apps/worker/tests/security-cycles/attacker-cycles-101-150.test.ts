/**
 * 攻撃者視点のレビュー → テストで仕様固定（バッチ 101–150）。
 * request-body / signed-payload / query-limits / cors / tracking / outbound / welcome-anxiety 等。
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

function hexHmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Same as worker tracking-friend-token signPayload (for adversarial payload tests). */
async function trackingB64UrlHmac(secret: string, encodedPayload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(encodedPayload));
  let binary = '';
  for (const byte of new Uint8Array(signature)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function storedMsg(type: string, content: string, opts?: { flexAltFallback?: string }) {
  const { buildMessageFromStoredContent } = await import(
    '../../src/services/stored-line-message.js'
  );
  return buildMessageFromStoredContent(type, content, opts);
}

describe('攻撃者サイクル 101–150（セキュリティバッチ）', () => {
  it('cycle 101: readJsonBodyWithLimit throws on invalid JSON', async () => {
    const { InvalidJsonBodyError, readJsonBodyWithLimit } = await import(
      '../../src/services/request-body.js'
    );
    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    await expect(readJsonBodyWithLimit(request, 1024)).rejects.toBeInstanceOf(InvalidJsonBodyError);
  });

  it('cycle 102: readJsonBodyWithLimit throws on empty body', async () => {
    const { InvalidJsonBodyError, readJsonBodyWithLimit } = await import(
      '../../src/services/request-body.js'
    );
    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });
    await expect(readJsonBodyWithLimit(request, 1024)).rejects.toBeInstanceOf(InvalidJsonBodyError);
  });

  it('cycle 103: readTextBodyWithLimit rejects UTF-8 body over byte limit', async () => {
    const { BodyTooLargeError, readTextBodyWithLimit } = await import(
      '../../src/services/request-body.js'
    );
    const text = 'あ'.repeat(20);
    const request = new Request('http://localhost/test', {
      method: 'POST',
      body: text,
    });
    await expect(readTextBodyWithLimit(request, 50)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('cycle 104: negative Content-Length is ignored; actual body still size-checked', async () => {
    const { BodyTooLargeError, readTextBodyWithLimit } = await import(
      '../../src/services/request-body.js'
    );
    const body = 'x'.repeat(200);
    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Length': '-1' },
      body,
    });
    await expect(readTextBodyWithLimit(request, 100)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('cycle 105: clampListLimit Infinity string uses fallback', async () => {
    const { clampListLimit } = await import('../../src/services/query-limits.js');
    expect(clampListLimit('Infinity', 40, 200)).toBe(40);
  });

  it('cycle 106: clampOffset Infinity yields 0', async () => {
    const { clampOffset } = await import('../../src/services/query-limits.js');
    expect(clampOffset('Infinity', 1000)).toBe(0);
  });

  it('cycle 107: clampListLimit accepts scientific notation', async () => {
    const { clampListLimit } = await import('../../src/services/query-limits.js');
    expect(clampListLimit('1e2', 10, 500)).toBe(100);
  });

  it('cycle 108: clampOffset floors fractional offset', async () => {
    const { clampOffset } = await import('../../src/services/query-limits.js');
    expect(clampOffset('3.9', 100)).toBe(3);
  });

  it('cycle 109: clampListLimit trims surrounding whitespace in raw', async () => {
    const { clampListLimit } = await import('../../src/services/query-limits.js');
    expect(clampListLimit('  50  ', 10, 200)).toBe(50);
  });

  it('cycle 110: isSafeHttpsOutboundUrl rejects 0.0.0.0', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://0.0.0.0/')).toBe(false);
  });

  it('cycle 111: isSafeHttpsOutboundUrl allows last public IPv4', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://255.255.255.255/')).toBe(true);
  });

  it('cycle 112: verifySignedPayload rejects truncated hex MAC', async () => {
    const { verifySignedPayload } = await import('../../src/services/signed-payload.js');
    const mac = hexHmac('s', 'payload');
    await expect(verifySignedPayload('s', 'payload', mac.slice(0, 32))).resolves.toBe(false);
  });

  it('cycle 113: verifySignedPayload rejects last-hex-digit mismatch', async () => {
    const { verifySignedPayload } = await import('../../src/services/signed-payload.js');
    const mac = hexHmac('s', 'payload');
    const wrong = `${mac.slice(0, -1)}${mac.endsWith('0') ? '1' : '0'}`;
    await expect(verifySignedPayload('s', 'payload', wrong)).resolves.toBe(false);
  });

  it('cycle 114: trackingLinkSigningSecret uses API_KEY when TRACKING_LINK_SECRET is blank', async () => {
    const { trackingLinkSigningSecret } = await import(
      '../../src/services/tracking-friend-token.js'
    );
    expect(
      trackingLinkSigningSecret({
        TRACKING_LINK_SECRET: '   ',
        API_KEY: 'fallback-key',
      }),
    ).toBe('fallback-key');
  });

  it('cycle 115: verifyTrackedLinkFriendToken rejects exp equal to now', async () => {
    const { issueTrackedLinkFriendToken, verifyTrackedLinkFriendToken } = await import(
      '../../src/services/tracking-friend-token.js'
    );
    const now = 1_720_000_000;
    const token = await issueTrackedLinkFriendToken(
      'sec',
      { linkId: 'L', friendId: 'F', expiresInSeconds: 0 },
      { issuedAt: now },
    );
    expect(await verifyTrackedLinkFriendToken('sec', 'L', token, { now })).toBeNull();
  });

  it('cycle 116: verifyTrackedLinkFriendToken rejects tampered base64 payload', async () => {
    const { issueTrackedLinkFriendToken, verifyTrackedLinkFriendToken } = await import(
      '../../src/services/tracking-friend-token.js'
    );
    const token = await issueTrackedLinkFriendToken('sec', {
      linkId: 'L',
      friendId: 'F',
      expiresInSeconds: 3600,
    });
    const [enc, sig] = token.split('.');
    const tamperedEnc = `${enc.slice(0, -1)}${enc.slice(-1) === 'A' ? 'B' : 'A'}`;
    expect(await verifyTrackedLinkFriendToken('sec', 'L', `${tamperedEnc}.${sig}`)).toBeNull();
  });

  it('cycle 117: verifyTrackedLinkFriendToken rejects more than one dot segment', async () => {
    const { issueTrackedLinkFriendToken, verifyTrackedLinkFriendToken } = await import(
      '../../src/services/tracking-friend-token.js'
    );
    const token = await issueTrackedLinkFriendToken('sec', {
      linkId: 'L',
      friendId: 'F',
      expiresInSeconds: 3600,
    });
    expect(await verifyTrackedLinkFriendToken('sec', 'L', `${token}.extra`)).toBeNull();
  });

  it('cycle 118: collectLineLoginChannelIds dedupes repeated channel ids', async () => {
    const { collectLineLoginChannelIds } = await import('../../src/services/line-id-token.js');
    expect(
      collectLineLoginChannelIds('chan-default', [
        { login_channel_id: 'dup' },
        { login_channel_id: 'dup' },
      ]),
    ).toEqual(['chan-default', 'dup']);
  });

  it('cycle 119: isAllowedOrigin rejects null', async () => {
    const { buildAllowedOrigins, isAllowedOrigin } = await import(
      '../../src/services/cors-policy.js'
    );
    const origins = buildAllowedOrigins({ WEB_URL: 'https://app.example.com' });
    expect(isAllowedOrigin(null, origins)).toBe(false);
  });

  it('cycle 120: isAllowedOrigin rejects non-URL garbage', async () => {
    const { buildAllowedOrigins, isAllowedOrigin } = await import(
      '../../src/services/cors-policy.js'
    );
    const origins = buildAllowedOrigins({ WEB_URL: 'https://app.example.com' });
    expect(isAllowedOrigin('%%%not-a-url', origins)).toBe(false);
  });

  it('cycle 121: buildAllowedOrigins skips javascript: entries', async () => {
    const { buildAllowedOrigins } = await import('../../src/services/cors-policy.js');
    const origins = buildAllowedOrigins({
      ALLOWED_ORIGINS: 'javascript:alert(1), https://ok.example.com',
    });
    expect(origins).toContain('https://ok.example.com');
    expect(origins.some((o) => o.startsWith('javascript'))).toBe(false);
  });

  it('cycle 122: parseAnxietyPostbackData empty trimmed is null', async () => {
    const { parseAnxietyPostbackData } = await import('../../src/services/welcome-anxiety-flow.js');
    expect(parseAnxietyPostbackData('   ')).toBeNull();
  });

  it('cycle 123: parseAnxietyPostbackData trims outer whitespace', async () => {
    const { parseAnxietyPostbackData } = await import('../../src/services/welcome-anxiety-flow.js');
    expect(parseAnxietyPostbackData('  anxiety=iv  ')).toBe('iv');
  });

  it('cycle 124: welcomeAnxietyRichMenuOnly false when unset', async () => {
    const { welcomeAnxietyRichMenuOnly } = await import(
      '../../src/services/welcome-anxiety-flow.js'
    );
    expect(welcomeAnxietyRichMenuOnly({} as never)).toBe(false);
  });

  it('cycle 125: welcomeAnxietyFlowEnabled false for whitespace-only flag', async () => {
    const { welcomeAnxietyFlowEnabled } = await import(
      '../../src/services/welcome-anxiety-flow.js'
    );
    expect(welcomeAnxietyFlowEnabled({ WELCOME_ANXIETY_FLOW: '   ' } as never)).toBe(false);
  });

  it('cycle 126: tryParseJsonRecord undefined yields null', async () => {
    const { tryParseJsonRecord } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonRecord(undefined)).toBeNull();
  });

  it('cycle 127: tryParseJsonArray undefined yields empty array', async () => {
    const { tryParseJsonArray } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonArray(undefined)).toEqual([]);
  });

  it('cycle 128: parseStringArrayJson rejects inner non-string after unwrap', async () => {
    const { parseStringArrayJson } = await import('../../src/services/safe-json.js');
    expect(parseStringArrayJson('"[1,2]"')).toBeNull();
  });

  it('cycle 129: unsafeSendWebhookUrlInActions rejects blob: URL', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(
      unsafeSendWebhookUrlInActions([
        { type: 'send_webhook', params: { url: 'blob:https://x/uuid' } },
      ]),
    ).toMatch(/not allowed|public https/i);
  });

  it('cycle 130: isSafeHttpsOutboundUrl rejects file: scheme', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('file:///etc/passwd')).toBe(false);
  });

  it('cycle 131: verifyAdminSessionToken rejects wrong secret', async () => {
    const { issueAdminSessionToken, verifyAdminSessionToken } = await import(
      '../../src/services/admin-session.js'
    );
    const t = await issueAdminSessionToken('good-secret', { expiresInSeconds: 3600 });
    expect(await verifyAdminSessionToken('other-secret', t)).toBeNull();
  });

  it('cycle 132: verifyAdminSessionToken rejects tampered signature', async () => {
    const { issueAdminSessionToken, verifyAdminSessionToken } = await import(
      '../../src/services/admin-session.js'
    );
    const t = await issueAdminSessionToken('sec', { expiresInSeconds: 3600 });
    const tampered = t.slice(0, -8) + 'abcdef12';
    expect(await verifyAdminSessionToken('sec', tampered)).toBeNull();
  });

  it('cycle 133: readTextBodyWithLimit allows zero Content-Length and empty body', async () => {
    const { readTextBodyWithLimit } = await import('../../src/services/request-body.js');
    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Length': '0' },
      body: '',
    });
    await expect(readTextBodyWithLimit(request, 1024)).resolves.toBe('');
  });

  it('cycle 134: invalid Content-Length header is ignored for early reject', async () => {
    const { BodyTooLargeError, readTextBodyWithLimit } = await import(
      '../../src/services/request-body.js'
    );
    const body = 'y'.repeat(50);
    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Length': 'not-a-number' },
      body,
    });
    await expect(readTextBodyWithLimit(request, 40)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('cycle 135: isSafeHttpsOutboundUrl rejects private 10.0.0.0/8 with explicit port', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://10.0.0.1:8443/')).toBe(false);
  });

  it('cycle 136: resolveSafeRedirectUrl allows configured https origin with path', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('https://client.example/deep/path?q=1', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBe('https://client.example/deep/path?q=1');
  });

  it('cycle 137: flex payload with only non-text structure still yields flex type', async () => {
    const m = await storedMsg(
      'flex',
      JSON.stringify({
        type: 'bubble',
        body: { type: 'box', contents: [{ type: 'separator' }] },
      }),
      { flexAltFallback: 'FB' },
    );
    expect(m.type).toBe('flex');
    if (m.type === 'flex') expect(m.altText).toBe('FB');
  });

  it('cycle 138: image with empty string URLs falls back to text', async () => {
    const m = await storedMsg(
      'image',
      JSON.stringify({ originalContentUrl: '', previewImageUrl: '' }),
    );
    expect(m.type).toBe('text');
  });

  it('cycle 139: addMessageVariation no-ops on empty text', async () => {
    const { addMessageVariation } = await import('../../src/services/stealth.js');
    expect(addMessageVariation('', 0)).toBe('');
  });

  it('cycle 140: calculateStaggerDelay small batch uses short window', async () => {
    const { calculateStaggerDelay } = await import('../../src/services/stealth.js');
    const d = calculateStaggerDelay(10, 0);
    expect(d).toBeGreaterThanOrEqual(100);
    expect(d).toBeLessThan(10_000);
  });

  it('cycle 141: StealthRateLimiter allows calls under the cap without long wait', async () => {
    const { StealthRateLimiter } = await import('../../src/services/stealth.js');
    const limiter = new StealthRateLimiter(5, 60_000);
    await limiter.waitForSlot();
    await limiter.waitForSlot();
    await expect(limiter.waitForSlot()).resolves.toBeUndefined();
  });

  it('cycle 142: tryParseJsonLoose does not throw on deep valid JSON string', async () => {
    const { tryParseJsonLoose } = await import('../../src/services/safe-json.js');
    const nested = JSON.stringify({ a: { b: { c: 1 } } });
    expect(tryParseJsonLoose(nested)).toEqual({ a: { b: { c: 1 } } });
  });

  it('cycle 143: clampIntInRange trims whitespace around slot-style params', async () => {
    const { clampIntInRange } = await import('../../src/services/query-limits.js');
    expect(clampIntInRange('  30  ', 60, 15, 180)).toBe(30);
  });

  it('cycle 144: parseStringArrayJson rejects double-encoded non-array JSON', async () => {
    const { parseStringArrayJson } = await import('../../src/services/safe-json.js');
    expect(parseStringArrayJson('"{\\"x\\":1}"')).toBeNull();
  });

  it('cycle 145: resolveSafeRedirectUrl rejects backslash-prefixed path trick', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('\\/\\/evil.com', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://worker.example.com',
      }),
    ).toBeNull();
  });

  it('cycle 146: isSafeHttpsOutboundUrl rejects invalid URL with no host', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://')).toBe(false);
  });

  it('cycle 147: collectLineLoginChannelIds omits empty default when unset', async () => {
    const { collectLineLoginChannelIds } = await import('../../src/services/line-id-token.js');
    expect(collectLineLoginChannelIds('', [{ login_channel_id: 'only' }])).toEqual(['only']);
  });

  it('cycle 148: verifyTrackedLinkFriendToken rejects numeric fid in JSON', async () => {
    const { verifyTrackedLinkFriendToken } = await import(
      '../../src/services/tracking-friend-token.js'
    );
    const enc = Buffer.from(
      JSON.stringify({
        scope: 'tracked_link_friend',
        lid: 'L',
        fid: 999,
        iat: 1,
        exp: 9_999_999_999,
      }),
    ).toString('base64url');
    const sig = await trackingB64UrlHmac('sec', enc);
    expect(await verifyTrackedLinkFriendToken('sec', 'L', `${enc}.${sig}`)).toBeNull();
  });

  it('cycle 149: unsafeSendWebhookUrlInActions rejects ftp: in send_webhook', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(
      unsafeSendWebhookUrlInActions([
        { type: 'send_webhook', params: { url: 'ftp://files.example/x' } },
      ]),
    ).toMatch(/not allowed|public https/i);
  });

  it('cycle 150: tryParseJson handles null raw with fallback', async () => {
    const { tryParseJson } = await import('../../src/services/safe-json.js');
    expect(tryParseJson(null, { x: 1 })).toEqual({ x: 1 });
  });
});
