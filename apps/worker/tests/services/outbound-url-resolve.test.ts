import { describe, expect, it, vi } from 'vitest';

function dnsResponse(status: number, answer: Array<{ type: number; data: string }>) {
  return new Response(JSON.stringify({ Status: status, Answer: answer }), {
    status: 200,
    headers: { 'Content-Type': 'application/dns-json' },
  });
}

describe('assertHttpsOutboundUrlResolvedSafe', () => {
  it('skips DNS for URL hostnames that are literal public IPs', async () => {
    const fetchFn = vi.fn();
    const { assertHttpsOutboundUrlResolvedSafe } = await import(
      '../../src/services/outbound-url-resolve.js'
    );
    const r = await assertHttpsOutboundUrlResolvedSafe('https://1.1.1.1/hook', fetchFn);
    expect(r.ok).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects when sync URL policy fails', async () => {
    const fetchFn = vi.fn();
    const { assertHttpsOutboundUrlResolvedSafe } = await import(
      '../../src/services/outbound-url-resolve.js'
    );
    const r = await assertHttpsOutboundUrlResolvedSafe('https://192.168.0.1/x', fetchFn);
    expect(r.ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects when DNS A record resolves to a private IPv4', async () => {
    const fetchFn = vi.fn().mockResolvedValue(dnsResponse(0, [{ type: 1, data: '192.168.44.1' }]));
    const { assertHttpsOutboundUrlResolvedSafe } = await import(
      '../../src/services/outbound-url-resolve.js'
    );
    const r = await assertHttpsOutboundUrlResolvedSafe('https://evil-ssrf.test/hook', fetchFn);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/private|disallowed/i);
    expect(fetchFn).toHaveBeenCalled();
  });

  it('allows when DNS A record is a public address', async () => {
    const fetchFn = vi.fn().mockResolvedValue(dnsResponse(0, [{ type: 1, data: '93.184.216.34' }]));
    const { assertHttpsOutboundUrlResolvedSafe } = await import(
      '../../src/services/outbound-url-resolve.js'
    );
    const r = await assertHttpsOutboundUrlResolvedSafe('https://example.test/hook', fetchFn);
    expect(r.ok).toBe(true);
  });

  it('rejects when CNAME chain ends at a private A record', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(dnsResponse(0, [{ type: 5, data: 'inner.evil.test.' }]))
      .mockResolvedValueOnce(dnsResponse(0, [{ type: 1, data: '10.0.0.1' }]))
      .mockResolvedValueOnce(dnsResponse(0, []));
    const { assertHttpsOutboundUrlResolvedSafe } = await import(
      '../../src/services/outbound-url-resolve.js'
    );
    const r = await assertHttpsOutboundUrlResolvedSafe('https://alias.evil.test/h', fetchFn);
    expect(r.ok).toBe(false);
  });
});

describe('assertSendWebhookActionsDnsSafe', () => {
  it('returns ok when there is no send_webhook action', async () => {
    const fetchFn = vi.fn();
    const { assertSendWebhookActionsDnsSafe } = await import(
      '../../src/services/outbound-url-resolve.js'
    );
    const r = await assertSendWebhookActionsDnsSafe(
      [{ type: 'add_tag', params: { tagId: 't' } }],
      fetchFn,
    );
    expect(r.ok).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects send_webhook URL whose DNS maps to private space', async () => {
    const fetchFn = vi.fn().mockResolvedValue(dnsResponse(0, [{ type: 1, data: '127.0.0.1' }]));
    const { assertSendWebhookActionsDnsSafe } = await import(
      '../../src/services/outbound-url-resolve.js'
    );
    const r = await assertSendWebhookActionsDnsSafe(
      [{ type: 'send_webhook', params: { url: 'https://loop.example/x' } }],
      fetchFn,
    );
    expect(r.ok).toBe(false);
  });
});
