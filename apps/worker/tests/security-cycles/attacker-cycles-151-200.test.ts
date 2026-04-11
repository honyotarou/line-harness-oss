/**
 * 攻撃者視点のレビュー → テストで仕様固定（バッチ 151–200）。
 * segment-query / stripe-signature / step-delivery expandVariables / liff-oauth-state / rate-limit 等。
 */
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('攻撃者サイクル 151–200（セキュリティバッチ）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('cycle 151: buildSegmentQuery rejects metadata key with dot (path injection)', async () => {
    const { buildSegmentQuery } = await import('../../src/services/segment-query.js');
    expect(() =>
      buildSegmentQuery({
        operator: 'AND',
        rules: [{ type: 'metadata_equals', value: { key: 'a.b', value: '1' } }],
      }),
    ).toThrow(/metadata key must be 1–64 chars/);
  });

  it('cycle 152: buildSegmentQuery rejects metadata key with double-quote', async () => {
    const { buildSegmentQuery } = await import('../../src/services/segment-query.js');
    expect(() =>
      buildSegmentQuery({
        operator: 'AND',
        rules: [{ type: 'metadata_equals', value: { key: 'x"y', value: '1' } }],
      }),
    ).toThrow(/metadata key must be 1–64 chars/);
  });

  it('cycle 153: buildSegmentQuery rejects empty metadata key', async () => {
    const { buildSegmentQuery } = await import('../../src/services/segment-query.js');
    expect(() =>
      buildSegmentQuery({
        operator: 'AND',
        rules: [{ type: 'metadata_not_equals', value: { key: '', value: '1' } }],
      }),
    ).toThrow(/metadata key must be 1–64 chars/);
  });

  it('cycle 154: buildSegmentQuery rejects overlong metadata key', async () => {
    const { buildSegmentQuery } = await import('../../src/services/segment-query.js');
    expect(() =>
      buildSegmentQuery({
        operator: 'AND',
        rules: [{ type: 'metadata_equals', value: { key: 'a'.repeat(65), value: '1' } }],
      }),
    ).toThrow(/metadata key must be 1–64 chars/);
  });

  it('cycle 155: buildSegmentQuery OR joins clauses', async () => {
    const { buildSegmentQuery } = await import('../../src/services/segment-query.js');
    const r = buildSegmentQuery({
      operator: 'OR',
      rules: [
        { type: 'tag_exists', value: 't1' },
        { type: 'ref_code', value: 'r1' },
      ],
    });
    expect(r.sql).toContain(' OR ');
    expect(r.bindings).toEqual(['t1', 'r1']);
  });

  it('cycle 156: verifyStripeSignature rejects body tamper (HMAC mismatch)', async () => {
    const { verifyStripeSignature } = await import('../../src/services/stripe-signature.js');
    const secret = 'whsec_x';
    const body = '{"ok":true}';
    const t = '1700000000';
    const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    await expect(
      verifyStripeSignature(secret, '{"ok":false}', `t=${t},v1=${v1}`, {
        nowSeconds: 1_700_000_000,
        toleranceSeconds: 300,
      }),
    ).resolves.toBe(false);
  });

  it('cycle 157: verifyStripeSignature rejects non-numeric timestamp', async () => {
    const { verifyStripeSignature } = await import('../../src/services/stripe-signature.js');
    await expect(
      verifyStripeSignature('s', '{}', 't=abc,v1=00', { nowSeconds: 1, toleranceSeconds: 300 }),
    ).resolves.toBe(false);
  });

  it('cycle 158: expandVariables drops auth_url when channel id has spaces', async () => {
    const { expandVariables } = await import('../../src/services/message-expand-variables.js');
    const out = expandVariables(
      'x {{auth_url:bad id}} y',
      { id: 'f1', display_name: 'N', user_id: 'u1' },
      'https://api.example.com',
    );
    expect(out).toBe('x  y');
  });

  it('cycle 159: expandVariables drops auth_url when channel id has script-like chars', async () => {
    const { expandVariables } = await import('../../src/services/message-expand-variables.js');
    const out = expandVariables(
      'x {{auth_url:chan<script>}} y',
      { id: 'f1', display_name: 'N', user_id: 'u1' },
      'https://api.example.com',
    );
    expect(out).toBe('x  y');
  });

  it('cycle 160: expandVariables builds auth_url for safe LINE-style channel id', async () => {
    const { expandVariables } = await import('../../src/services/message-expand-variables.js');
    const out = expandVariables(
      'go {{auth_url:2001234567}} end',
      { id: 'f1', display_name: 'N', user_id: 'u9' },
      'https://worker.example.com',
      { allowedAuthUrlChannelIds: new Set(['2001234567']) },
    );
    expect(out).toContain('https://worker.example.com/auth/line?');
    expect(out).toContain('account=2001234567');
    expect(out).toContain('uid=u9');
  });

  it('cycle 160b: expandVariables strips auth_url when channel id is not in allowlist', async () => {
    const { expandVariables } = await import('../../src/services/message-expand-variables.js');
    const out = expandVariables(
      'go {{auth_url:2001234567}} end',
      { id: 'f1', display_name: 'N', user_id: 'u9' },
      'https://worker.example.com',
      { allowedAuthUrlChannelIds: new Set(['other-channel']) },
    );
    expect(out).toBe('go  end');
  });

  it('cycle 161: verifyLiffOAuthState rejects expired state (clock jump)', async () => {
    const { signLiffOAuthState, verifyLiffOAuthState } = await import(
      '../../src/services/liff-oauth-state.js'
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T00:00:00Z'));
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
      'secret-151',
    );
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    await expect(verifyLiffOAuthState(token, 'secret-151')).resolves.toBeNull();
  });

  it('cycle 162: verifyLiffOAuthState rejects malformed base64 payload', async () => {
    const { verifyLiffOAuthState } = await import('../../src/services/liff-oauth-state.js');
    await expect(verifyLiffOAuthState('!!!.!!!', 'secret')).resolves.toBeNull();
  });

  it('cycle 163: verifyLiffOAuthState rejects token without dot', async () => {
    const { verifyLiffOAuthState } = await import('../../src/services/liff-oauth-state.js');
    await expect(verifyLiffOAuthState('nodots', 's')).resolves.toBeNull();
  });

  it('cycle 164: getRequestClientAddress prefers CF-Connecting-IP over X-Forwarded-For', async () => {
    const { getRequestClientAddress } = await import('../../src/services/request-rate-limit.js');
    const req = new Request('http://x/', {
      headers: {
        'CF-Connecting-IP': '  198.51.100.1  ',
        'X-Forwarded-For': '203.0.113.5',
      },
    });
    expect(getRequestClientAddress(req)).toBe('198.51.100.1');
  });

  it('cycle 165: getRequestClientAddress uses X-Real-IP on localhost when CF/XFF absent', async () => {
    const { getRequestClientAddress } = await import('../../src/services/request-rate-limit.js');
    const req = new Request('http://localhost/rate', {
      headers: { 'X-Real-IP': '  192.0.2.1 ' },
    });
    expect(getRequestClientAddress(req)).toBe('192.0.2.1');
  });

  it('cycle 166: getRequestClientAddress returns anonymous without headers', async () => {
    const { getRequestClientAddress } = await import('../../src/services/request-rate-limit.js');
    expect(getRequestClientAddress(new Request('http://x/'))).toBe('anonymous');
  });

  it('cycle 167: checkRateLimit isolates buckets', async () => {
    const { checkRateLimit, resetRequestRateLimits } = await import(
      '../../src/services/request-rate-limit.js'
    );
    resetRequestRateLimits();
    expect(
      checkRateLimit({ bucket: 'a', key: 'k', limit: 1, windowMs: 60_000, now: 1 }),
    ).toMatchObject({ allowed: true });
    expect(
      checkRateLimit({ bucket: 'b', key: 'k', limit: 1, windowMs: 60_000, now: 2 }),
    ).toMatchObject({ allowed: true });
  });

  it('cycle 168: resetRequestRateLimits clears in-memory counters', async () => {
    const { checkRateLimit, resetRequestRateLimits } = await import(
      '../../src/services/request-rate-limit.js'
    );
    resetRequestRateLimits();
    checkRateLimit({ bucket: 'z', key: 'k', limit: 1, windowMs: 60_000, now: 1 });
    checkRateLimit({ bucket: 'z', key: 'k', limit: 1, windowMs: 60_000, now: 2 });
    expect(
      checkRateLimit({ bucket: 'z', key: 'k', limit: 1, windowMs: 60_000, now: 3 }),
    ).toMatchObject({ allowed: false });
    resetRequestRateLimits();
    expect(
      checkRateLimit({ bucket: 'z', key: 'k', limit: 1, windowMs: 60_000, now: 4 }),
    ).toMatchObject({ allowed: true });
  });

  it('cycle 169: verifyTrackedLinkFriendToken rejects numeric lid with valid MAC', async () => {
    const { verifyTrackedLinkFriendToken } = await import(
      '../../src/services/tracking-friend-token.js'
    );
    const enc = Buffer.from(
      JSON.stringify({
        scope: 'tracked_link_friend',
        lid: 123,
        fid: 'friend-1',
        iat: 1,
        exp: 9_999_999_999,
      }),
    ).toString('base64url');
    const sig = await trackingB64UrlHmac('sec', enc);
    expect(await verifyTrackedLinkFriendToken('sec', '123', `${enc}.${sig}`)).toBeNull();
  });

  it('cycle 170: verifyTrackedLinkFriendToken rejects string exp', async () => {
    const { verifyTrackedLinkFriendToken } = await import(
      '../../src/services/tracking-friend-token.js'
    );
    const enc = Buffer.from(
      JSON.stringify({
        scope: 'tracked_link_friend',
        lid: 'L',
        fid: 'F',
        iat: 1,
        exp: '9999999999',
      }),
    ).toString('base64url');
    const sig = await trackingB64UrlHmac('sec', enc);
    expect(await verifyTrackedLinkFriendToken('sec', 'L', `${enc}.${sig}`)).toBeNull();
  });

  it('cycle 171: tryParseJsonArray null yields empty array', async () => {
    const { tryParseJsonArray } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonArray(null)).toEqual([]);
  });

  it('cycle 172: isValidAdminAuthToken true for freshly issued session', async () => {
    const { issueAdminSessionToken, isValidAdminAuthToken } = await import(
      '../../src/services/admin-session.js'
    );
    const t = await issueAdminSessionToken('adm-secret', { expiresInSeconds: 3600 });
    await expect(isValidAdminAuthToken('adm-secret', t)).resolves.toBe(true);
  });

  it('cycle 173: isValidAdminAuthToken false for random string', async () => {
    const { isValidAdminAuthToken } = await import('../../src/services/admin-session.js');
    await expect(isValidAdminAuthToken('adm-secret', 'not-a-jwt')).resolves.toBe(false);
  });

  it('cycle 174: buildAllowedOrigins dedupes same origin from WEB and list', async () => {
    const { buildAllowedOrigins } = await import('../../src/services/cors-policy.js');
    const o = buildAllowedOrigins({
      WEB_URL: 'https://dup.example.com/',
      ALLOWED_ORIGINS: 'https://dup.example.com',
    });
    expect(o.filter((x) => x === 'https://dup.example.com').length).toBe(1);
  });

  it('cycle 175: clampListLimit negative numeric string uses fallback', async () => {
    const { clampListLimit } = await import('../../src/services/query-limits.js');
    expect(clampListLimit('-3', 25, 100)).toBe(25);
  });

  it('cycle 176: readTextBodyWithLimit allows body exactly at byte limit', async () => {
    const { readTextBodyWithLimit } = await import('../../src/services/request-body.js');
    const body = 'a'.repeat(100);
    const req = new Request('http://x/', { method: 'POST', body });
    await expect(readTextBodyWithLimit(req, 100)).resolves.toHaveLength(100);
  });

  it('cycle 177: readTextBodyWithLimit rejects one byte over limit', async () => {
    const { BodyTooLargeError, readTextBodyWithLimit } = await import(
      '../../src/services/request-body.js'
    );
    const body = 'b'.repeat(101);
    const req = new Request('http://x/', { method: 'POST', body });
    await expect(readTextBodyWithLimit(req, 100)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('cycle 178: verifySignedPayload rejects non-hex character in signature', async () => {
    const { verifySignedPayload } = await import('../../src/services/signed-payload.js');
    const mac = createHmac('sha256', 's').update('p').digest('hex');
    const bad = `${mac.slice(0, -1)}g`;
    await expect(verifySignedPayload('s', 'p', bad)).resolves.toBe(false);
  });

  it('cycle 179: unsafeSendWebhookUrlInActions rejects http URL', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(
      unsafeSendWebhookUrlInActions([
        { type: 'send_webhook', params: { url: 'http://example.com/hook' } },
      ]),
    ).toMatch(/not allowed|public https/i);
  });

  it('cycle 180: parseAnxietyPostbackData anxiety= alone yields null', async () => {
    const { parseAnxietyPostbackData } = await import('../../src/services/welcome-anxiety-flow.js');
    expect(parseAnxietyPostbackData('anxiety=')).toBeNull();
  });

  it('cycle 181: parseAnxietyPostbackData rejects sql-like key', async () => {
    const { parseAnxietyPostbackData } = await import('../../src/services/welcome-anxiety-flow.js');
    expect(parseAnxietyPostbackData('anxiety=DROP TABLE')).toBeNull();
  });

  it('cycle 182: image with whitespace-only URLs falls back to text', async () => {
    const m = await storedMsg(
      'image',
      JSON.stringify({ originalContentUrl: '   ', previewImageUrl: '\t' }),
    );
    expect(m.type).toBe('text');
  });

  it('cycle 183: tryParseJsonRecord accepts empty object', async () => {
    const { tryParseJsonRecord } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonRecord('{}')).toEqual({});
  });

  it('cycle 184: parseStringArrayJson accepts empty JSON array', async () => {
    const { parseStringArrayJson } = await import('../../src/services/safe-json.js');
    expect(parseStringArrayJson('[]')).toEqual([]);
  });

  it('cycle 185: isAllowedOrigin is case-sensitive on scheme/host', async () => {
    const { buildAllowedOrigins, isAllowedOrigin } = await import(
      '../../src/services/cors-policy.js'
    );
    const origins = buildAllowedOrigins({ WEB_URL: 'https://App.Example.COM/path' });
    expect(isAllowedOrigin('https://app.example.com', origins)).toBe(true);
    expect(isAllowedOrigin('HTTP://APP.EXAMPLE.COM', origins)).toBe(false);
  });

  it('cycle 186: collectLineLoginChannelIds skips null login_channel_id', async () => {
    const { collectLineLoginChannelIds } = await import('../../src/services/line-id-token.js');
    expect(
      collectLineLoginChannelIds('def', [{ login_channel_id: null }, { login_channel_id: 'x' }]),
    ).toEqual(['def', 'x']);
  });

  it('cycle 187: buildMessage delegates to hardened stored-line-message', async () => {
    const { buildMessage } = await import('../../src/services/step-delivery.js');
    const m = buildMessage('flex', '[]');
    expect(m.type).toBe('text');
  });

  it('cycle 188: isSafeHttpsOutboundUrl allows resolver-style public IP', async () => {
    const { isSafeHttpsOutboundUrl } = await import('../../src/services/outbound-url.js');
    expect(isSafeHttpsOutboundUrl('https://9.9.9.9/dns-query')).toBe(true);
  });

  it('cycle 189: resolveSafeRedirectUrl rejects http absolute URL', async () => {
    const { resolveSafeRedirectUrl } = await import('../../src/services/liff-redirect.js');
    expect(
      resolveSafeRedirectUrl('http://client.example/ok', {
        WEB_URL: 'https://client.example',
        WORKER_URL: 'https://w.example',
      }),
    ).toBeNull();
  });

  it('cycle 190: verifyLiffOAuthState rejects wrong secret on valid-shaped token', async () => {
    const { signLiffOAuthState, verifyLiffOAuthState } = await import(
      '../../src/services/liff-oauth-state.js'
    );
    const token = await signLiffOAuthState(
      {
        ref: 'r',
        redirect: 'https://x',
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
      'good',
    );
    await expect(verifyLiffOAuthState(token, 'wrong')).resolves.toBeNull();
  });

  it('cycle 191: clampOffset trims and floors', async () => {
    const { clampOffset } = await import('../../src/services/query-limits.js');
    expect(clampOffset('  7.8  ', 1000)).toBe(7);
  });

  it('cycle 192: getRequestClientAddress empty X-Forwarded-For first hop uses anonymous', async () => {
    const { getRequestClientAddress } = await import('../../src/services/request-rate-limit.js');
    const req = new Request('http://x/', {
      headers: { 'X-Forwarded-For': ' , 203.0.113.1' },
    });
    expect(getRequestClientAddress(req)).toBe('anonymous');
  });

  it('cycle 193: expandVariables strips if_ref block when no ref_code', async () => {
    const { expandVariables } = await import('../../src/services/message-expand-variables.js');
    const out = expandVariables('a {{#if_ref}}SECRET{{/if_ref}} b', {
      id: '1',
      display_name: 'x',
      user_id: 'u',
    });
    expect(out).toBe('a  b');
  });

  it('cycle 194: expandVariables keeps if_ref when ref_code set', async () => {
    const { expandVariables } = await import('../../src/services/message-expand-variables.js');
    const out = expandVariables('a {{#if_ref}}R{{/if_ref}} b', {
      id: '1',
      display_name: 'x',
      user_id: 'u',
      ref_code: 'rc',
    });
    expect(out).toBe('a R b');
  });

  it('cycle 195: unsafeSendWebhookUrlInActions allows safe URL with path and query', async () => {
    const { unsafeSendWebhookUrlInActions } = await import('../../src/services/outbound-url.js');
    expect(
      unsafeSendWebhookUrlInActions([
        {
          type: 'send_webhook',
          params: { url: 'https://hooks.slack.com/services/T/B/xx?foo=1' },
        },
      ]),
    ).toBeNull();
  });

  it('cycle 196: tryParseJsonLoose returns JSON number primitive', async () => {
    const { tryParseJsonLoose } = await import('../../src/services/safe-json.js');
    expect(tryParseJsonLoose('42')).toBe(42);
  });

  it('cycle 197: welcomeAnxietyFlowEnabled false for off string', async () => {
    const { welcomeAnxietyFlowEnabled } = await import(
      '../../src/services/welcome-anxiety-flow.js'
    );
    expect(welcomeAnxietyFlowEnabled({ WELCOME_ANXIETY_FLOW: 'off' } as never)).toBe(false);
  });

  it('cycle 198: verifyTrackedLinkFriendToken rejects linkId mismatch vs payload lid', async () => {
    const { issueTrackedLinkFriendToken, verifyTrackedLinkFriendToken } = await import(
      '../../src/services/tracking-friend-token.js'
    );
    const token = await issueTrackedLinkFriendToken('s', {
      linkId: 'L',
      friendId: 'real-friend',
      expiresInSeconds: 3600,
    });
    expect(await verifyTrackedLinkFriendToken('s', 'L', token)).toBe('real-friend');
    expect(await verifyTrackedLinkFriendToken('s', 'L-other', token)).toBeNull();
  });

  it('cycle 199: BodyTooLargeError exposes limitBytes', async () => {
    const { BodyTooLargeError, readTextBodyWithLimit } = await import(
      '../../src/services/request-body.js'
    );
    const req = new Request('http://x/', {
      method: 'POST',
      headers: { 'Content-Length': '9999' },
      body: 'x'.repeat(9999),
    });
    await expect(readTextBodyWithLimit(req, 10)).rejects.toMatchObject({
      limitBytes: 10,
      name: 'BodyTooLargeError',
    });
  });

  it('cycle 200: parseStringArrayJson rejects array with boolean element', async () => {
    const { parseStringArrayJson } = await import('../../src/services/safe-json.js');
    expect(parseStringArrayJson('["ok",false]')).toBeNull();
  });
});
