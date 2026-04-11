/**
 * 攻撃者視点のレビュー → テストで仕様固定（バッチ 301–350）。
 * アフィリエイト click URL / LIFF state 期限 / JSON ボディ / レート制限 IP / outbound / セグメント 等。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('攻撃者サイクル 301–350（セキュリティバッチ）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('cycle 301: verifyLiffOAuthState rejects token after TTL window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z').getTime());
    const { signLiffOAuthState, verifyLiffOAuthState } = await import(
      '../../src/services/liff-oauth-state.js'
    );
    const token = await signLiffOAuthState(
      {
        ref: '',
        redirect: '',
        gclid: '',
        fbclid: '',
        utmSource: '',
        utmMedium: '',
        utmCampaign: '',
        utmContent: '',
        utmTerm: '',
        account: '',
        uid: 'u',
      },
      'secret-301',
    );
    vi.setSystemTime(new Date('2026-06-01T14:00:00Z').getTime());
    expect(await verifyLiffOAuthState(token, 'secret-301')).toBeNull();
  });

  it('cycle 302: verifyLiffOAuthState rejects random non-base64 payload blob', async () => {
    const { verifyLiffOAuthState } = await import('../../src/services/liff-oauth-state.js');
    expect(await verifyLiffOAuthState('###not-valid###.###also###', 'secret')).toBeNull();
  });

  it('cycle 303: readJsonBodyWithLimit throws InvalidJsonBodyError on malformed JSON', async () => {
    const { InvalidJsonBodyError, readJsonBodyWithLimit } = await import(
      '../../src/services/request-body.js'
    );
    const req = new Request('http://x/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    await expect(readJsonBodyWithLimit(req, 1024)).rejects.toBeInstanceOf(InvalidJsonBodyError);
  });

  it('cycle 304: parseBearerAuthorization allows horizontal tab between scheme and token', async () => {
    const { parseBearerAuthorization } = await import('../../src/services/bearer-authorization.js');
    expect(parseBearerAuthorization('Bearer\tabc.def')).toBe('abc.def');
  });

  it('cycle 305: tryParseJson returns fallback for empty string raw', async () => {
    const { tryParseJson } = await import('../../src/services/safe-json.js');
    expect(tryParseJson('', { ok: true })).toEqual({ ok: true });
  });

  it('cycle 306: isSafeHttpsOutboundUrl allows public resolver IP 8.8.8.8', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://8.8.8.8/dns-query')).toBe(true);
  });

  it('cycle 307: mergeFriendMetadataPatch preserves array field values', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const r = mergeFriendMetadataPatch({}, { tags: ['a', 'b'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.merged.tags).toEqual(['a', 'b']);
  });

  it('cycle 308: computeDeliveryRetryDelayMs with zero base returns zero', async () => {
    const { computeDeliveryRetryDelayMs } = await import(
      '../../src/services/delivery-retry-backoff.js'
    );
    expect(computeDeliveryRetryDelayMs(1, 0)).toBe(0);
  });

  it('cycle 309: buildSegmentQuery supports is_following false', async () => {
    const { buildSegmentQuery } = await import('../../src/services/segment-query.js');
    const r = buildSegmentQuery({
      operator: 'AND',
      rules: [{ type: 'is_following', value: false }],
    });
    expect(r.sql).toContain('is_following = ?');
    expect(r.bindings).toContain(0);
  });

  it('cycle 310: unsafeSendWebhookUrlInActions returns null when actions is not an array', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(unsafeSendWebhookUrlInActions({ type: 'send_webhook' } as never)).toBeNull();
  });

  it('cycle 311: getRequestClientAddress skips whitespace-only CF-Connecting-IP', async () => {
    const { getRequestClientAddress } = await import('../../src/services/request-rate-limit.js');
    const req = new Request('http://x/', {
      headers: {
        'CF-Connecting-IP': '   \t  ',
        'X-Forwarded-For': '198.51.100.9',
      },
    });
    expect(getRequestClientAddress(req)).toBe('198.51.100.9');
  });

  it('cycle 312: verifySignedPayload accepts uppercase hex in provided signature', async () => {
    const { verifySignedPayload } = await import('../../src/services/signed-payload.js');
    const secret = 'sigsec';
    const payload = 'hello';
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const buf = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const lower = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const upper = lower.toUpperCase();
    await expect(verifySignedPayload(secret, payload, upper)).resolves.toBe(true);
  });

  it('cycle 313: clampIntInRange clamps to max when raw exceeds', async () => {
    const { clampIntInRange } = await import('../../src/services/query-limits.js');
    expect(clampIntInRange('99', 5, 0, 10)).toBe(10);
  });

  it('cycle 314: clampIntInRange clamps to min when raw below', async () => {
    const { clampIntInRange } = await import('../../src/services/query-limits.js');
    expect(clampIntInRange('-9', 5, 2, 10)).toBe(2);
  });

  it('cycle 315: tryParseJsonLoose parses JSON array root', async () => {
    const { tryParseJsonLoose } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonLoose('[1,2]')).toEqual([1, 2]);
  });

  it('cycle 316: parseStringArrayJson supports double-encoded JSON string', async () => {
    const { parseStringArrayJson } = await import('../../src/services/safe-json.js');
    const inner = JSON.stringify(['a', 'b']);
    expect(parseStringArrayJson(JSON.stringify(inner))).toEqual(['a', 'b']);
  });

  it('cycle 317: collectLineLoginChannelIds dedupes repeated login_channel_id', async () => {
    const { collectLineLoginChannelIds } = await import('../../src/services/line-id-token.js');
    expect(
      collectLineLoginChannelIds('root', [
        { login_channel_id: 'dup' },
        { login_channel_id: 'dup' },
      ]),
    ).toEqual(['root', 'dup']);
  });

  it('cycle 318: welcomeAnxietyRichMenuOnly is false when binding unset', async () => {
    const { welcomeAnxietyRichMenuOnly } = await import(
      '../../src/services/welcome-anxiety-flow.js'
    );
    expect(welcomeAnxietyRichMenuOnly({} as never)).toBe(false);
  });

  it('cycle 319: parseAnxietyPostbackData accepts anxiety=iv', async () => {
    const { parseAnxietyPostbackData } = await import('../../src/services/welcome-anxiety-flow.js');
    expect(parseAnxietyPostbackData('anxiety=iv')).toBe('iv');
  });

  it('cycle 320: BodyTooLargeError exposes limitBytes', async () => {
    const { BodyTooLargeError } = await import('../../src/services/request-body.js');
    expect(new BodyTooLargeError(500).limitBytes).toBe(500);
  });

  it('cycle 321: verifyTrackedLinkFriendToken rejects token for different link id', async () => {
    const { issueTrackedLinkFriendToken, verifyTrackedLinkFriendToken } = await import(
      '../../src/services/tracking-friend-token.js'
    );
    const tok = await issueTrackedLinkFriendToken(
      's',
      { linkId: 'L1', friendId: 'F1', expiresInSeconds: 3600 },
      { issuedAt: 1_700_000_000 },
    );
    expect(await verifyTrackedLinkFriendToken('s', 'L2', tok)).toBeNull();
  });

  it('cycle 322: trackingLinkSigningSecret falls back when optional secret is whitespace only', async () => {
    const { trackingLinkSigningSecret } = await import(
      '../../src/services/tracking-friend-token.js'
    );
    expect(
      trackingLinkSigningSecret({
        TRACKING_LINK_SECRET: '   \n\t  ',
        API_KEY: 'api-fallback',
      }),
    ).toBe('api-fallback');
  });

  it('cycle 323: isSafeHttpsOutboundUrl accepts punycode hostname', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://xn--80aswg.xn--p1ai/')).toBe(true);
  });

  it('cycle 324: runWithConcurrencyLimit rejects negative limit', async () => {
    const { runWithConcurrencyLimit } = await import('../../src/services/scheduler.js');
    await expect(runWithConcurrencyLimit([async () => 1], -1)).rejects.toThrow(/at least 1/);
  });

  it('cycle 325: mergeFriendMetadataPatch allows 198 safe keys', async () => {
    const { mergeFriendMetadataPatch } = await import(
      '../../src/services/friend-metadata-merge.js'
    );
    const patch: Record<string, unknown> = {};
    for (let i = 0; i < 198; i++) patch[`k${i}`] = i;
    const r = mergeFriendMetadataPatch({ a: 1 }, patch);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.merged).length).toBe(199);
  });

  it('cycle 326: resolveSafeRedirectUrl rejects blank trimmed redirect', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(resolveSafeRedirectUrl('   ', { WEB_URL: 'https://client.example' })).toBeNull();
  });

  it('cycle 327: expandVariables clears name when display_name null', async () => {
    const { expandVariables } = await import('../../src/services/message-expand-variables.js');
    expect(expandVariables('Hi {{name}}', { id: '1', display_name: null, user_id: 'u' })).toBe(
      'Hi ',
    );
  });

  it('cycle 328: verifyStripeSignature rejects non-hex v1 digest', async () => {
    const { verifyStripeSignature } = await import('../../src/services/stripe-signature.js');
    await expect(
      verifyStripeSignature('whsec_x', '{}', 't=1700000000,v1=GGGGGG', {
        nowSeconds: 1_700_000_000,
        toleranceSeconds: 300,
      }),
    ).resolves.toBe(false);
  });

  it('cycle 329: verifyAdminSessionToken rejects malformed empty payload segment', async () => {
    const { verifyAdminSessionToken } = await import('../../src/services/admin-session.js');
    expect(await verifyAdminSessionToken('sec', '.onlysig')).toBeNull();
  });

  it('cycle 330: parseBearerAuthorization rejects non-Bearer schemes', async () => {
    const { parseBearerAuthorization } = await import('../../src/services/bearer-authorization.js');
    expect(parseBearerAuthorization('Digest username="u"')).toBeNull();
  });

  it('cycle 331: readTextBodyWithLimit accepts empty JSON object body', async () => {
    const { readTextBodyWithLimit } = await import('../../src/services/request-body.js');
    const req = new Request('http://x/', { method: 'POST', body: '{}' });
    await expect(readTextBodyWithLimit(req, 100)).resolves.toBe('{}');
  });

  it('cycle 332: buildSegmentQuery supports metadata_not_equals', async () => {
    const { buildSegmentQuery } = await import('../../src/services/segment-query.js');
    const r = buildSegmentQuery({
      operator: 'AND',
      rules: [{ type: 'metadata_not_equals', value: { key: 'tier', value: 'free' } }],
    });
    expect(r.sql).toContain('!=');
    expect(r.bindings).toContain('$.tier');
  });

  it('cycle 333: tryParseJson uses fallback when raw undefined', async () => {
    const { tryParseJson } = await import('../../src/services/safe-json.js');
    expect(tryParseJson(undefined, { x: 1 })).toEqual({ x: 1 });
  });

  it('cycle 334: isAllowedOrigin rejects origin with wrong port', async () => {
    const { buildAllowedOrigins, isAllowedOrigin } = await import(
      '../../src/services/cors-policy.js'
    );
    const allowed = new Set(buildAllowedOrigins({ WEB_URL: 'https://app.example.com' }));
    expect(isAllowedOrigin('https://app.example.com:444', allowed)).toBe(false);
  });

  it('cycle 335: addJitter with zero range returns base', async () => {
    const { addJitter } = await import('../../src/services/stealth.js');
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(addJitter(42, 0)).toBe(42);
  });

  it('cycle 336: calculateStaggerDelay for 101 messages batch 0 uses medium tier', async () => {
    const { calculateStaggerDelay } = await import('../../src/services/stealth.js');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const d = calculateStaggerDelay(101, 0);
    expect(d).toBe(0);
  });

  it('cycle 337: unsafeSendWebhookUrlInActions skips non-object array entries', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(
      unsafeSendWebhookUrlInActions([
        null,
        'x' as never,
        { type: 'send_webhook', params: { url: 'https://ok.example/h' } },
      ]),
    ).toBeNull();
  });

  it('cycle 338: verifySignedPayload rejects signature with wrong byte length', async () => {
    const { verifySignedPayload } = await import('../../src/services/signed-payload.js');
    await expect(verifySignedPayload('s', 'p', 'abcd')).resolves.toBe(false);
  });

  it('cycle 339: parseStringArrayJson rejects array with non-string element', async () => {
    const { parseStringArrayJson } = await import('../../src/services/safe-json.js');
    expect(parseStringArrayJson('["a",1]')).toBeNull();
  });

  it('cycle 340: clampOffset undefined raw yields zero offset', async () => {
    const { clampOffset } = await import('../../src/services/query-limits.js');
    expect(clampOffset(undefined, 50)).toBe(0);
  });

  it('cycle 341: AFFILIATE_CLICK_URL_MAX_LENGTH is exported as 2048', async () => {
    const { AFFILIATE_CLICK_URL_MAX_LENGTH } = await import('../../src/routes/affiliates.js');
    expect(AFFILIATE_CLICK_URL_MAX_LENGTH).toBe(2048);
  });

  it('cycle 342: issueAdminSessionToken verifies under same clock', async () => {
    const { issueAdminSessionToken, verifyAdminSessionToken } = await import(
      '../../src/services/admin-session.js'
    );
    const t = await issueAdminSessionToken('k', { issuedAt: 1_710_000_000, expiresInSeconds: 60 });
    const p = await verifyAdminSessionToken('k', t, { now: 1_710_000_030 });
    expect(p?.scope).toBe('admin');
  });

  it('cycle 343: tryParseJsonArray empty string yields empty array', async () => {
    const { tryParseJsonArray } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonArray('')).toEqual([]);
  });

  it('cycle 344: getRequestClientAddress trims CF-Connecting-IP', async () => {
    const { getRequestClientAddress } = await import('../../src/services/request-rate-limit.js');
    const req = new Request('http://x/', {
      headers: { 'CF-Connecting-IP': '  198.51.100.55  ' },
    });
    expect(getRequestClientAddress(req)).toBe('198.51.100.55');
  });

  it('cycle 345: buildAllowedOrigins includes LIFF_URL origin', async () => {
    const { buildAllowedOrigins } = await import('../../src/services/cors-policy.js');
    expect(buildAllowedOrigins({ LIFF_URL: 'https://liff.line.me/app-id' })).toContain(
      'https://liff.line.me',
    );
  });

  it('cycle 346: expandVariables substitutes friend_id', async () => {
    const { expandVariables } = await import('../../src/services/message-expand-variables.js');
    expect(
      expandVariables('id={{friend_id}}', { id: 'fid-9', display_name: 'N', user_id: 'u' }),
    ).toBe('id=fid-9');
  });

  it('cycle 347: computeDeliveryRetryDelayMs caps at one hour for huge attempt count', async () => {
    const { computeDeliveryRetryDelayMs } = await import(
      '../../src/services/delivery-retry-backoff.js'
    );
    expect(computeDeliveryRetryDelayMs(25, 1_000_000)).toBe(3_600_000);
  });

  it('cycle 348: parseAnxietyPostbackData decodes url-encoded anxiety key', async () => {
    const { parseAnxietyPostbackData } = await import('../../src/services/welcome-anxiety-flow.js');
    expect(parseAnxietyPostbackData(encodeURIComponent('anxiety=ortho'))).toBe('ortho');
  });

  it('cycle 349: verifyLiffOAuthState rejects appended extra dot segment', async () => {
    const { signLiffOAuthState, verifyLiffOAuthState } = await import(
      '../../src/services/liff-oauth-state.js'
    );
    const token = await signLiffOAuthState(
      {
        ref: '',
        redirect: '',
        gclid: '',
        fbclid: '',
        utmSource: '',
        utmMedium: '',
        utmCampaign: '',
        utmContent: '',
        utmTerm: '',
        account: '',
        uid: '',
      },
      's349',
    );
    expect(await verifyLiffOAuthState(`${token}.extra`, 's349')).toBeNull();
  });

  it('cycle 350: parseBearerAuthorization rejects Bearer with only newlines as token', async () => {
    const { parseBearerAuthorization } = await import('../../src/services/bearer-authorization.js');
    expect(parseBearerAuthorization('Bearer\n\n')).toBeNull();
  });
});
