import { describe, expect, it, vi } from 'vitest';

describe('fetchHttpsUrlAfterDnsAssertion', () => {
  it('returns reason when DNS assertion fails', async () => {
    const fetchFn = vi.fn();
    const { fetchHttpsUrlAfterDnsAssertion } = await import(
      '../../src/services/outbound-https-fetch.js'
    );
    const r = await fetchHttpsUrlAfterDnsAssertion('https://192.168.1.1/x', fetchFn);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('private');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetches only after DoH approves the hostname', async () => {
    const fetchFn = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes('cloudflare-dns.com/dns-query')) {
        return new Response(
          JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }),
          { status: 200, headers: { 'Content-Type': 'application/dns-json' } },
        );
      }
      if (url.startsWith('https://example.com/')) {
        return new Response('ok', { status: 201 });
      }
      return new Response('', { status: 404 });
    });

    const { fetchHttpsUrlAfterDnsAssertion } = await import(
      '../../src/services/outbound-https-fetch.js'
    );
    const r = await fetchHttpsUrlAfterDnsAssertion('https://example.com/hook', fetchFn, {
      method: 'POST',
      body: '{}',
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.response.status).toBe(201);
    }
    const postCalls = fetchFn.mock.calls.filter((c) => {
      const u = typeof c[0] === 'string' ? c[0] : (c[0] as Request).url;
      return u.startsWith('https://example.com/');
    });
    expect(postCalls).toHaveLength(1);

    const dnsCalls = fetchFn.mock.calls.filter((c) => {
      const u = typeof c[0] === 'string' ? c[0] : (c[0] as Request).url;
      return u.includes('cloudflare-dns.com/dns-query');
    });
    expect(dnsCalls.length).toBeGreaterThanOrEqual(4);
  });
});
