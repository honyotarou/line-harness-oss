/**
 * 攻撃者視点のレビュー → テストで仕様固定（バッチ 201–250）。
 * friend-metadata-merge / delivery-retry / scheduler / stripe / outbound / rate-limit 等。
 */
import { describe, expect, it, vi } from 'vitest';

describe('攻撃者サイクル 201–250（セキュリティバッチ）', () => {
  it('cycle 201: mergeFriendMetadataPatch rejects JSON array payload', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const r = mergeFriendMetadataPatch({}, [1, 2]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('cycle 202: mergeFriendMetadataPatch rejects null patch', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const r = mergeFriendMetadataPatch({ a: 1 }, null);
    expect(r.ok).toBe(false);
  });

  it('cycle 203: mergeFriendMetadataPatch rejects string patch', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const r = mergeFriendMetadataPatch({}, 'not-object' as unknown);
    expect(r.ok).toBe(false);
  });

  it('cycle 204: mergeFriendMetadataPatch strips __proto__ key', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const r = mergeFriendMetadataPatch({ a: 1 }, { __proto__: { polluted: true }, b: 2 } as Record<
      string,
      unknown
    >);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.merged).toEqual({ a: 1, b: 2 });
      expect(Object.prototype.hasOwnProperty.call(r.merged, '__proto__')).toBe(false);
    }
  });

  it('cycle 205: mergeFriendMetadataPatch strips constructor and prototype', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const r = mergeFriendMetadataPatch({}, {
      constructor: { x: 1 },
      prototype: { y: 1 },
      ok: true,
    } as Record<string, unknown>);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.merged).toEqual({ ok: true });
  });

  it('cycle 206: mergeFriendMetadataPatch rejects more than 200 safe keys', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const patch: Record<string, unknown> = {};
    for (let i = 0; i < 201; i++) patch[`k${i}`] = 1;
    const r = mergeFriendMetadataPatch({}, patch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/200/);
  });

  it('cycle 207: mergeFriendMetadataPatch allows exactly 200 safe keys', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const patch: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) patch[`k${i}`] = i;
    const r = mergeFriendMetadataPatch({ base: true }, patch);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.merged).length).toBe(201);
  });

  it('cycle 208: mergeFriendMetadataPatch overwrites overlapping keys', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const r = mergeFriendMetadataPatch({ tier: 'free' }, { tier: 'pro' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.merged.tier).toBe('pro');
  });

  it('cycle 209: mergeFriendMetadataPatch empty object preserves existing only', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const r = mergeFriendMetadataPatch({ x: 1 }, {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.merged).toEqual({ x: 1 });
  });

  it('cycle 210: forbidden keys do not count toward 200-key cap', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const patch: Record<string, unknown> = {
      __proto__: {},
      constructor: {},
      prototype: {},
    };
    for (let i = 0; i < 200; i++) patch[`f${i}`] = 1;
    const r = mergeFriendMetadataPatch({}, patch);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.merged).length).toBe(200);
  });

  it('cycle 211: computeDeliveryRetryDelayMs first attempt uses base only', async () => {
    const { computeDeliveryRetryDelayMs } = await import(
      '../../src/services/delivery-reliability.js'
    );
    expect(computeDeliveryRetryDelayMs(1, 300_000)).toBe(300_000);
  });

  it('cycle 212: computeDeliveryRetryDelayMs doubles per extra attempt', async () => {
    const { computeDeliveryRetryDelayMs } = await import(
      '../../src/services/delivery-reliability.js'
    );
    expect(computeDeliveryRetryDelayMs(2, 300_000)).toBe(600_000);
    expect(computeDeliveryRetryDelayMs(3, 300_000)).toBe(1_200_000);
  });

  it('cycle 213: computeDeliveryRetryDelayMs caps at one hour', async () => {
    const { computeDeliveryRetryDelayMs } = await import(
      '../../src/services/delivery-reliability.js'
    );
    expect(computeDeliveryRetryDelayMs(99, 300_000)).toBe(60 * 60_000);
  });

  it('cycle 214: runWithConcurrencyLimit throws when limit < 1', async () => {
    const { runWithConcurrencyLimit } = await import('../../src/services/scheduler.js');
    await expect(runWithConcurrencyLimit([async () => 1], 0)).rejects.toThrow(/at least 1/);
  });

  it('cycle 215: runWithConcurrencyLimit returns empty array for no tasks', async () => {
    const { runWithConcurrencyLimit } = await import('../../src/services/scheduler.js');
    await expect(runWithConcurrencyLimit([], 3)).resolves.toEqual([]);
  });

  it('cycle 216: runWithConcurrencyLimit runs single worker when limit is 1', async () => {
    const { runWithConcurrencyLimit } = await import('../../src/services/scheduler.js');
    const order: number[] = [];
    const tasks = [
      async () => {
        order.push(1);
        return 1;
      },
      async () => {
        order.push(2);
        return 2;
      },
    ];
    const out = await runWithConcurrencyLimit(tasks, 1);
    expect(out).toEqual([1, 2]);
    expect(order).toEqual([1, 2]);
  });

  it('cycle 217: buildScheduledAccountTargets skips inactive accounts', async () => {
    const { buildScheduledAccountTargets } = await import('../../src/services/scheduler.js');
    const targets = buildScheduledAccountTargets('default-token', [
      { id: 'off', is_active: 0, channel_access_token: 'x' },
      { id: 'on', is_active: 1, channel_access_token: 'tok-on' },
    ]);
    expect(targets).toHaveLength(2);
    expect(targets[0].lineAccountId).toBeNull();
    expect(targets[1].lineAccountId).toBe('on');
  });

  it('cycle 218: buildScheduledAccountTargets default row is first', async () => {
    const { buildScheduledAccountTargets } = await import('../../src/services/scheduler.js');
    const targets = buildScheduledAccountTargets('def', []);
    expect(targets).toEqual([{ lineAccountId: null, accessToken: 'def' }]);
  });

  it('cycle 219: verifyStripeSignature rejects v1 with wrong length', async () => {
    const { verifyStripeSignature } = await import('../../src/services/stripe-signature.js');
    await expect(
      verifyStripeSignature('s', '{}', 't=1700000000,v1=deadbeef', {
        nowSeconds: 1_700_000_000,
        toleranceSeconds: 300,
      }),
    ).resolves.toBe(false);
  });

  it('cycle 220: isSafeHttpsOutboundUrl rejects about: scheme', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('about:blank')).toBe(false);
  });

  it('cycle 221: tryParseJson uses fallback when raw is undefined', async () => {
    const { tryParseJson } = await import('../../src/services/safe-json.js');
    expect(tryParseJson(undefined, { z: 3 })).toEqual({ z: 3 });
  });

  it('cycle 222: clampIntInRange Infinity string uses fallback path', async () => {
    const { clampIntInRange } = await import('../../src/services/query-limits.js');
    expect(clampIntInRange('-Infinity', 12, 0, 24)).toBe(12);
  });

  it('cycle 223: unsafeSendWebhookUrlInActions rejects send_webhook without params.url', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(
      unsafeSendWebhookUrlInActions([
        { type: 'send_webhook', params: {} as Record<string, string> },
      ]),
    ).toMatch(/requires params.url|url/i);
  });

  it('cycle 224: resolveSafeRedirectUrl rejects newline-prefixed absolute URL', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('\nhttps://evil.example/', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://w.example',
      }),
    ).toBeNull();
  });

  it('cycle 225: stored flex message keeps unicode in altText slice bound', async () => {
    const { buildMessageFromStoredContent } = await import(
      '../../src/services/stored-line-message.js'
    );
    const ja = 'あ'.repeat(120);
    const m = buildMessageFromStoredContent(
      'flex',
      JSON.stringify({
        type: 'bubble',
        body: { type: 'box', contents: [{ type: 'text', text: ja }] },
      }),
    );
    expect(m.type).toBe('flex');
    if (m.type === 'flex') expect([...m.altText].length).toBeLessThanOrEqual(100);
  });

  it('cycle 226: verifySignedPayload rejects signature with only whitespace', async () => {
    const { verifySignedPayload } = await import('../../src/services/signed-payload.js');
    await expect(verifySignedPayload('s', 'p', '   ')).resolves.toBe(false);
  });

  it('cycle 227: getRequestClientAddress skips empty CF-Connecting-IP', async () => {
    const { getRequestClientAddress } = await import('../../src/services/request-rate-limit.js');
    const req = new Request('http://x/', {
      headers: {
        'CF-Connecting-IP': '',
        'X-Forwarded-For': '198.51.100.2',
      },
    });
    expect(getRequestClientAddress(req)).toBe('198.51.100.2');
  });

  it('cycle 228: checkRateLimit with limit 0 blocks immediately', async () => {
    const { checkRateLimit, resetRequestRateLimits } = await import(
      '../../src/services/request-rate-limit.js'
    );
    resetRequestRateLimits();
    expect(
      checkRateLimit({ bucket: 'z', key: 'k', limit: 0, windowMs: 60_000, now: 1 }),
    ).toMatchObject({ allowed: false });
  });

  it('cycle 229: verifyStripeSignature accepts timestamp exactly at tolerance edge', async () => {
    const { verifyStripeSignature } = await import('../../src/services/stripe-signature.js');
    const secret = 'whsec_edge';
    const body = '{}';
    const nowSec = 1_700_000_000;
    const t = String(nowSec - 300);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${t}.${body}`));
    const v1 = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    await expect(
      verifyStripeSignature(secret, body, `t=${t},v1=${v1}`, {
        nowSeconds: nowSec,
        toleranceSeconds: 300,
      }),
    ).resolves.toBe(true);
  });

  it('cycle 230: verifyStripeSignature rejects one second past tolerance', async () => {
    const { verifyStripeSignature } = await import('../../src/services/stripe-signature.js');
    const secret = 'whsec_past';
    const body = '{}';
    const nowSec = 1_700_000_000;
    const t = String(nowSec - 301);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${t}.${body}`));
    const v1 = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    await expect(
      verifyStripeSignature(secret, body, `t=${t},v1=${v1}`, {
        nowSeconds: nowSec,
        toleranceSeconds: 300,
      }),
    ).resolves.toBe(false);
  });

  it('cycle 231: buildSegmentQuery allows metadata key with underscore and digits', async () => {
    const { buildSegmentQuery } = await import('../../src/services/segment-query.js');
    const r = buildSegmentQuery({
      operator: 'AND',
      rules: [{ type: 'metadata_equals', value: { key: 'user_tier_2', value: 'vip' } }],
    });
    expect(r.bindings[0]).toBe('$.user_tier_2');
  });

  it('cycle 232: isAllowedOrigin rejects empty origin string', async () => {
    const { buildAllowedOrigins, isAllowedOrigin } = await import(
      '../../src/services/cors-policy.js'
    );
    const origins = buildAllowedOrigins({ WEB_URL: 'https://a.example.com' });
    expect(isAllowedOrigin('', origins)).toBe(false);
  });

  it('cycle 233: parseAnxietyPostbackData rejects unknown long garbage key', async () => {
    const { parseAnxietyPostbackData } = await import('../../src/services/welcome-anxiety-flow.js');
    expect(parseAnxietyPostbackData(`anxiety=${'x'.repeat(500)}`)).toBeNull();
  });

  it('cycle 234: normalizeOrigin returns null for non-URL allowlist entry', async () => {
    const { buildAllowedOrigins } = await import('../../src/services/cors-policy.js');
    const o = buildAllowedOrigins({ ALLOWED_ORIGINS: 'not-a-url, https://valid.example.com' });
    expect(o).toContain('https://valid.example.com');
    expect(o.some((x) => x.includes('not'))).toBe(false);
  });

  it('cycle 235: mergeFriendMetadataPatch preserves nested object values', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const r = mergeFriendMetadataPatch({}, { nested: { a: 1 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.merged.nested).toEqual({ a: 1 });
  });

  it('cycle 236: tryParseJsonArray returns empty for JSON null', async () => {
    const { tryParseJsonArray } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonArray('null')).toEqual([]);
  });

  it('cycle 237: parseStringArrayJson returns null for JSON number', async () => {
    const { parseStringArrayJson } = await import('../../src/services/safe-json.js');
    expect(parseStringArrayJson('42')).toBeNull();
  });

  it('cycle 238: isSafeHttpsOutboundUrl rejects mailto:', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('mailto:user@example.com')).toBe(false);
  });

  it('cycle 239: unsafeSendWebhookUrlInActions allows only https after first passes', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(
      unsafeSendWebhookUrlInActions([
        { type: 'add_tag', params: { tagId: 'x' } },
        { type: 'send_webhook', params: { url: 'https://ok.example/h' } },
      ]),
    ).toBeNull();
  });

  it('cycle 240: expandVariables leaves auth_url token when apiOrigin missing', async () => {
    const { expandVariables } = await import('../../src/services/step-delivery.js');
    const out = expandVariables('x {{auth_url:2001234567}} y', {
      id: '1',
      display_name: 'N',
      user_id: 'u',
    });
    expect(out).toBe('x {{auth_url:2001234567}} y');
  });

  it('cycle 241: clampListLimit MAX_SAFE_INTEGER string caps to max', async () => {
    const { clampListLimit } = await import('../../src/services/query-limits.js');
    expect(clampListLimit(String(Number.MAX_SAFE_INTEGER), 10, 100)).toBe(100);
  });

  it('cycle 242: collectLineLoginChannelIds keeps order with unique ids', async () => {
    const { collectLineLoginChannelIds } = await import('../../src/services/line-id-token.js');
    expect(
      collectLineLoginChannelIds('a', [{ login_channel_id: 'z' }, { login_channel_id: 'y' }]),
    ).toEqual(['a', 'z', 'y']);
  });

  it('cycle 243: welcomeAnxietyFlowEnabled false for false string', async () => {
    const { welcomeAnxietyFlowEnabled } = await import(
      '../../src/services/welcome-anxiety-flow.js'
    );
    expect(welcomeAnxietyFlowEnabled({ WELCOME_ANXIETY_FLOW: 'false' } as never)).toBe(false);
  });

  it('cycle 244: readTextBodyWithLimit rejects when Content-Length exceeds limit', async () => {
    const { BodyTooLargeError, readTextBodyWithLimit } = await import(
      '../../src/services/request-body.js'
    );
    const req = new Request('http://x/', {
      method: 'POST',
      headers: { 'Content-Length': '5000' },
      body: 'x',
    });
    await expect(readTextBodyWithLimit(req, 100)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('cycle 245: verifyTrackedLinkFriendToken rejects wrong iat type', async () => {
    const { verifyTrackedLinkFriendToken } = await import(
      '../../src/services/tracking-friend-token.js'
    );
    const enc = Buffer.from(
      JSON.stringify({
        scope: 'tracked_link_friend',
        lid: 'L',
        fid: 'F',
        iat: '1',
        exp: 9_999_999_999,
      }),
    ).toString('base64url');
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode('sec'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(enc));
    let bin = '';
    for (const b of new Uint8Array(sigBuf)) bin += String.fromCharCode(b);
    const sig = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    expect(await verifyTrackedLinkFriendToken('sec', 'L', `${enc}.${sig}`)).toBeNull();
  });

  it('cycle 246: BodyTooLargeError is instanceof Error', async () => {
    const { BodyTooLargeError } = await import('../../src/services/request-body.js');
    expect(new BodyTooLargeError(99)).toBeInstanceOf(Error);
  });

  it('cycle 247: InvalidJsonBodyError is instanceof Error', async () => {
    const { InvalidJsonBodyError } = await import('../../src/services/request-body.js');
    expect(new InvalidJsonBodyError()).toBeInstanceOf(Error);
  });

  it('cycle 248: tryParseJsonRecord rejects top-level JSON array', async () => {
    const { tryParseJsonRecord } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonRecord('[{}]')).toBeNull();
  });

  it('cycle 249: calculateStaggerDelay monotonic in batchIndex for large sends', async () => {
    const { calculateStaggerDelay } = await import('../../src/services/stealth.js');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const d0 = calculateStaggerDelay(2000, 0);
    const d5 = calculateStaggerDelay(2000, 5);
    expect(d5).toBeGreaterThanOrEqual(d0);
    vi.restoreAllMocks();
  });

  it('cycle 250: FRIEND_METADATA_PATCH_MAX_KEYS is 200', async () => {
    const { FRIEND_METADATA_PATCH_MAX_KEYS } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    expect(FRIEND_METADATA_PATCH_MAX_KEYS).toBe(200);
  });
});
