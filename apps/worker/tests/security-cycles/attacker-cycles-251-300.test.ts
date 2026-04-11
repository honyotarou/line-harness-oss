/**
 * 攻撃者視点のレビュー → テストで仕様固定（バッチ 251–300）。
 * Bearer スキーム正規化 / tracked-link URL 方針 / admin セッション / outbound / セグメント / 安全 JSON 等。
 */
import { describe, expect, it, vi } from 'vitest';

describe('攻撃者サイクル 251–300（セキュリティバッチ）', () => {
  it('cycle 251: parseBearerAuthorization accepts lowercase bearer scheme', async () => {
    const { parseBearerAuthorization } = await import('../../src/services/bearer-authorization.js');
    expect(parseBearerAuthorization('bearer secret-token')).toBe('secret-token');
  });

  it('cycle 252: parseBearerAuthorization accepts mixed-case Bearer', async () => {
    const { parseBearerAuthorization } = await import('../../src/services/bearer-authorization.js');
    expect(parseBearerAuthorization('BeArEr mixed-case-ok')).toBe('mixed-case-ok');
  });

  it('cycle 253: parseBearerAuthorization returns null for undefined', async () => {
    const { parseBearerAuthorization } = await import('../../src/services/bearer-authorization.js');
    expect(parseBearerAuthorization(undefined)).toBeNull();
  });

  it('cycle 254: parseBearerAuthorization returns null for Basic auth', async () => {
    const { parseBearerAuthorization } = await import('../../src/services/bearer-authorization.js');
    expect(parseBearerAuthorization('Basic dGVzdA==')).toBeNull();
  });

  it('cycle 255: parseBearerAuthorization trims header outer whitespace', async () => {
    const { parseBearerAuthorization } = await import('../../src/services/bearer-authorization.js');
    expect(parseBearerAuthorization('  Bearer  tok  ')).toBe('tok');
  });

  it('cycle 256: verifyAdminSessionToken rejects expired session', async () => {
    const { issueAdminSessionToken, verifyAdminSessionToken } = await import(
      '../../src/services/admin-session.js'
    );
    const now = 1_700_000_000;
    const token = await issueAdminSessionToken('sec', {
      issuedAt: now,
      expiresInSeconds: -10,
    });
    expect(await verifyAdminSessionToken('sec', token, { now })).toBeNull();
  });

  it('cycle 257: verifyAdminSessionToken rejects wrong HMAC signature', async () => {
    const { issueAdminSessionToken, verifyAdminSessionToken } = await import(
      '../../src/services/admin-session.js'
    );
    const token = await issueAdminSessionToken('good', {
      issuedAt: 1_700_000_000,
      expiresInSeconds: 3600,
    });
    const tampered = token.slice(0, -3) + 'XXX';
    expect(await verifyAdminSessionToken('good', tampered)).toBeNull();
  });

  it('cycle 258: isSafeHttpsOutboundUrl rejects data: URLs', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('cycle 259: isSafeHttpsOutboundUrl rejects plain http', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('http://example.com/')).toBe(false);
  });

  it('cycle 260: isSafeHttpsOutboundUrl rejects https private 192.168.x', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://192.168.0.1/')).toBe(false);
  });

  it('cycle 261: isSafeHttpsOutboundUrl rejects https loopback IPv6', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://[::1]/path')).toBe(false);
  });

  it('cycle 262: isSafeHttpsOutboundUrl rejects credentials in userinfo', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://user:pass@example.com/')).toBe(false);
  });

  it('cycle 263: isSafeHttpsOutboundUrl accepts explicit port 443 on public host', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://example.com:443/x')).toBe(true);
  });

  it('cycle 264: mergeFriendMetadataPatch with only forbidden keys leaves existing unchanged', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const r = mergeFriendMetadataPatch({ keep: 1 }, {
      __proto__: { x: 1 },
      constructor: { y: 1 },
      prototype: { z: 1 },
    } as Record<string, unknown>);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.merged).toEqual({ keep: 1 });
  });

  it('cycle 265: computeDeliveryRetryDelayMs uses base when attemptCount is 0', async () => {
    const { computeDeliveryRetryDelayMs } = await import(
      '../../src/services/delivery-reliability.js'
    );
    expect(computeDeliveryRetryDelayMs(0, 400)).toBe(400);
  });

  it('cycle 266: computeDeliveryRetryDelayMs attemptCount 0 matches attemptCount 1 base delay', async () => {
    const { computeDeliveryRetryDelayMs } = await import(
      '../../src/services/delivery-reliability.js'
    );
    expect(computeDeliveryRetryDelayMs(0, 300_000)).toBe(computeDeliveryRetryDelayMs(1, 300_000));
  });

  it('cycle 267: expandVariables drops auth_url when channel id exceeds 128 chars', async () => {
    const { expandVariables } = await import('../../src/services/step-delivery.js');
    const id = 'a'.repeat(129);
    const out = expandVariables(
      `{{auth_url:${id}}}`,
      { id: '1', display_name: 'N', user_id: 'u' },
      'https://w.example',
    );
    expect(out).toBe('');
  });

  it('cycle 268: expandVariables keeps auth_url at exactly 128 char channel id', async () => {
    const { expandVariables } = await import('../../src/services/step-delivery.js');
    const id = 'b'.repeat(128);
    const out = expandVariables(
      `{{auth_url:${id}}}`,
      { id: '1', display_name: 'N', user_id: 'u' },
      'https://w.example',
    );
    expect(out).toContain(`account=${id}`);
    expect(out.startsWith('https://w.example/auth/line?')).toBe(true);
  });

  it('cycle 269: buildSegmentQuery AND joins tag_exists and metadata_equals', async () => {
    const { buildSegmentQuery } = await import('../../src/services/segment-query.js');
    const r = buildSegmentQuery({
      operator: 'AND',
      rules: [
        { type: 'tag_exists', value: 't1' },
        { type: 'metadata_equals', value: { key: 'tier', value: 'gold' } },
      ],
    });
    expect(r.sql).toContain(' AND ');
    expect(r.bindings).toContain('t1');
    expect(r.bindings).toContain('$.tier');
    expect(r.bindings).toContain('gold');
  });

  it('cycle 270: tryParseJson parses JSON false without using fallback', async () => {
    const { tryParseJson } = await import('../../src/services/safe-json.js');
    expect(tryParseJson('false', true)).toBe(false);
  });

  it('cycle 271: clampOffset negative query uses zero', async () => {
    const { clampOffset } = await import('../../src/services/query-limits.js');
    expect(clampOffset('-5', 10_000)).toBe(0);
  });

  it('cycle 272: clampOffset caps at max', async () => {
    const { clampOffset } = await import('../../src/services/query-limits.js');
    expect(clampOffset('999999', 100)).toBe(100);
  });

  it('cycle 273: resolveSafeRedirectUrl allows https allowlist origin with hash', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    const href = resolveSafeRedirectUrl('https://client.example/app#frag', {
      WEB_URL: 'https://client.example',
    });
    expect(href).toBe('https://client.example/app#frag');
  });

  it('cycle 274: unsafeSendWebhookUrlInActions returns null for empty actions', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(unsafeSendWebhookUrlInActions([])).toBeNull();
  });

  it('cycle 275: getRequestClientAddress prefers CF-Connecting-IP when set', async () => {
    const { getRequestClientAddress } = await import('../../src/services/request-rate-limit.js');
    const req = new Request('http://x/', {
      headers: {
        'CF-Connecting-IP': '203.0.113.5',
        'X-Forwarded-For': '198.51.100.1',
      },
    });
    expect(getRequestClientAddress(req)).toBe('203.0.113.5');
  });

  it('cycle 276: verifyStripeSignature rejects header without v1', async () => {
    const { verifyStripeSignature } = await import('../../src/services/stripe-signature.js');
    await expect(
      verifyStripeSignature('whsec_x', '{}', 't=1700000000', { nowSeconds: 1_700_000_000 }),
    ).resolves.toBe(false);
  });

  it('cycle 277: verifyStripeSignature uses last t= when duplicated', async () => {
    const { verifyStripeSignature } = await import('../../src/services/stripe-signature.js');
    const secret = 'whsec_dup';
    const body = '{}';
    const nowSec = 1_700_000_000;
    const t = String(nowSec);
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
      verifyStripeSignature(secret, body, `t=1,t=${t},v1=${v1}`, {
        nowSeconds: nowSec,
        toleranceSeconds: 300,
      }),
    ).resolves.toBe(true);
  });

  it('cycle 278: issueTrackedLinkFriendToken with zero TTL verifies null at same second', async () => {
    const { issueTrackedLinkFriendToken, verifyTrackedLinkFriendToken } = await import(
      '../../src/services/tracking-friend-token.js'
    );
    const iat = 1_800_000_000;
    const token = await issueTrackedLinkFriendToken(
      'sec',
      { linkId: 'L', friendId: 'F', expiresInSeconds: 0 },
      { issuedAt: iat },
    );
    expect(await verifyTrackedLinkFriendToken('sec', 'L', token, { now: iat })).toBeNull();
  });

  it('cycle 279: BodyTooLargeError message mentions byte limit', async () => {
    const { BodyTooLargeError } = await import('../../src/services/request-body.js');
    expect(new BodyTooLargeError(8192).message).toMatch(/8192/);
  });

  it('cycle 280: InvalidJsonBodyError default message', async () => {
    const { InvalidJsonBodyError } = await import('../../src/services/request-body.js');
    expect(new InvalidJsonBodyError().message).toMatch(/Invalid JSON/);
  });

  it('cycle 281: mergeFriendMetadataPatch allows 199 new keys with one forbidden stripped', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const patch: Record<string, unknown> = { __proto__: 1 };
    for (let i = 0; i < 199; i++) patch[`k${i}`] = i;
    const r = mergeFriendMetadataPatch({}, patch);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.merged).length).toBe(199);
  });

  it('cycle 282: runWithConcurrencyLimit completes five tasks with limit 10', async () => {
    const { runWithConcurrencyLimit } = await import('../../src/services/scheduler.js');
    const tasks = [1, 2, 3, 4, 5].map((n) => async () => n);
    await expect(runWithConcurrencyLimit(tasks, 10)).resolves.toEqual([1, 2, 3, 4, 5]);
  });

  it('cycle 283: checkRateLimit allows first request under cap', async () => {
    const { checkRateLimit, resetRequestRateLimits } = await import(
      '../../src/services/request-rate-limit.js'
    );
    resetRequestRateLimits();
    expect(
      checkRateLimit({ bucket: 'c283', key: 'u1', limit: 5, windowMs: 60_000, now: 1 }),
    ).toMatchObject({ allowed: true });
  });

  it('cycle 284: collectLineLoginChannelIds with empty default and empty accounts', async () => {
    const { collectLineLoginChannelIds } = await import('../../src/services/line-id-token.js');
    expect(collectLineLoginChannelIds('', [])).toEqual([]);
  });

  it('cycle 285: welcomeAnxietyFlowEnabled is false when env flag unset', async () => {
    const { welcomeAnxietyFlowEnabled } = await import(
      '../../src/services/welcome-anxiety-flow.js'
    );
    expect(welcomeAnxietyFlowEnabled({} as never)).toBe(false);
  });

  it('cycle 286: parseAnxietyPostbackData rejects uppercase IV key', async () => {
    const { parseAnxietyPostbackData } = await import('../../src/services/welcome-anxiety-flow.js');
    expect(parseAnxietyPostbackData('anxiety=IV')).toBeNull();
  });

  it('cycle 287: parseStringArrayJson accepts unicode escape string elements', async () => {
    const { parseStringArrayJson } = await import('../../src/services/safe-json.js');
    expect(parseStringArrayJson(String.raw`["\u0000"]`)).toEqual(['\u0000']);
  });

  it('cycle 288: tryParseJsonLoose returns null for invalid JSON', async () => {
    const { tryParseJsonLoose } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonLoose('{')).toBeNull();
  });

  it('cycle 289: buildAllowedOrigins deduplicates repeated same origin', async () => {
    const { buildAllowedOrigins } = await import('../../src/services/cors-policy.js');
    const o = buildAllowedOrigins({
      WEB_URL: 'https://dup.example',
      ALLOWED_ORIGINS: 'https://dup.example, https://dup.example/path2',
    });
    expect(o.filter((x) => x === 'https://dup.example').length).toBe(1);
  });

  it('cycle 290: trackingLinkSigningSecret trims TRACKING_LINK_SECRET', async () => {
    const { trackingLinkSigningSecret } = await import(
      '../../src/services/tracking-friend-token.js'
    );
    expect(
      trackingLinkSigningSecret({
        TRACKING_LINK_SECRET: '  custom  ',
        API_KEY: 'fallback',
      }),
    ).toBe('custom');
  });

  it('cycle 291: isSafeHttpsOutboundUrl rejects file: scheme', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('file:///etc/passwd')).toBe(false);
  });

  it('cycle 292: mergeFriendMetadataPatch allows unicode metadata keys', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const r = mergeFriendMetadataPatch({}, { タグ: 'ok' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.merged).toEqual({ タグ: 'ok' });
  });

  it('cycle 293: parseBearerAuthorization returns null for Bearer without token', async () => {
    const { parseBearerAuthorization } = await import('../../src/services/bearer-authorization.js');
    expect(parseBearerAuthorization('Bearer')).toBeNull();
    expect(parseBearerAuthorization('Bearer ')).toBeNull();
  });

  it('cycle 294: verifyAdminSessionToken rejects token with extra dot segment', async () => {
    const { issueAdminSessionToken, verifyAdminSessionToken } = await import(
      '../../src/services/admin-session.js'
    );
    const token = await issueAdminSessionToken('s', {
      issuedAt: 1_700_000_000,
      expiresInSeconds: 3600,
    });
    expect(await verifyAdminSessionToken('s', `${token}.extra`)).toBeNull();
  });

  it('cycle 295: buildSegmentQuery OR joins two tag rules', async () => {
    const { buildSegmentQuery } = await import('../../src/services/segment-query.js');
    const r = buildSegmentQuery({
      operator: 'OR',
      rules: [
        { type: 'tag_exists', value: 'a' },
        { type: 'tag_exists', value: 'b' },
      ],
    });
    expect(r.sql).toContain(' OR ');
    expect(r.bindings).toEqual(['a', 'b']);
  });

  it('cycle 296: clampListLimit whitespace-only raw uses fallback', async () => {
    const { clampListLimit } = await import('../../src/services/query-limits.js');
    expect(clampListLimit('   \t  ', 33, 100)).toBe(33);
  });

  it('cycle 297: tryParseJsonArray parses newline inside JSON array string', async () => {
    const { tryParseJsonArray } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonArray('["a\\nb"]')).toEqual(['a\nb']);
  });

  it('cycle 298: resolveSafeRedirectUrl rejects https disallowed origin', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('https://evil.example/', { WEB_URL: 'https://client.example' }),
    ).toBeNull();
  });

  it('cycle 299: unsafeSendWebhookUrlInActions rejects second bad URL after good', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(
      unsafeSendWebhookUrlInActions([
        { type: 'send_webhook', params: { url: 'https://ok.example/hook' } },
        { type: 'send_webhook', params: { url: 'http://insecure.example/' } },
      ]),
    ).toMatch(/https|public|allowed/i);
  });

  it('cycle 300: calculateStaggerDelay for 1000 messages batch 0 is zero jitter when random is 0', async () => {
    const { calculateStaggerDelay } = await import('../../src/services/stealth.js');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const d = calculateStaggerDelay(1000, 0);
    expect(d).toBe(0);
    vi.restoreAllMocks();
  });
});
