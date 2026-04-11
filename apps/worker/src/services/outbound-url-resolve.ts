/**
 * DNS resolution checks for outbound HTTPS URLs (SSRF: hostname → private IP via public DNS).
 * Uses DNS-over-HTTPS (Cloudflare); {@link isSafeHttpsOutboundUrl} remains the first gate.
 */

import {
  isBlockedResolvedAddress,
  isSafeHttpsOutboundUrl,
  unsafeSendWebhookUrlInActions,
} from './outbound-url.js';

const DOH_ACCEPT = 'application/dns-json';

type DnsJsonAnswer = { type: number; data: string };

type DnsJsonBody = {
  Status?: number;
  Answer?: DnsJsonAnswer[];
};

function parseIpv4Literal(host: string): boolean {
  return /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(host);
}

async function dnsJsonQuery(
  hostname: string,
  recordType: number,
  fetchFn: typeof fetch,
): Promise<{ status: number; answers: DnsJsonAnswer[] } | null> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${recordType}`;
  try {
    const res = await fetchFn(url, {
      headers: { Accept: DOH_ACCEPT },
      redirect: 'manual',
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as DnsJsonBody;
    return {
      status: body.Status ?? 4,
      answers: body.Answer ?? [],
    };
  } catch {
    return null;
  }
}

function normalizeCnameTarget(data: string): string {
  return data.replace(/\.$/, '').toLowerCase();
}

/**
 * Collect all A and AAAA data for a name after following CNAME (max 10 hops).
 */
async function resolvedAddressesForHostname(
  hostname: string,
  fetchFn: typeof fetch,
): Promise<{ ok: true; addresses: string[] } | { ok: false; reason: string }> {
  let name = hostname.toLowerCase();
  const addresses: string[] = [];

  for (let hop = 0; hop < 10; hop += 1) {
    const aResp = await dnsJsonQuery(name, 1, fetchFn);
    if (!aResp) {
      return { ok: false, reason: 'Could not verify hostname DNS (lookup failed)' };
    }

    if (aResp.status !== 0 && aResp.status !== 3) {
      return { ok: false, reason: 'Could not verify hostname DNS (resolver error)' };
    }

    const answers = aResp.answers;
    const cname = answers.find((x) => x.type === 5);
    const arec = answers.filter((x) => x.type === 1).map((x) => x.data.trim());

    if (arec.length > 0) {
      for (const ip of arec) {
        addresses.push(ip);
      }
      const aaaaResp = await dnsJsonQuery(name, 28, fetchFn);
      if (aaaaResp && aaaaResp.status === 0) {
        for (const x of aaaaResp.answers.filter((a) => a.type === 28)) {
          addresses.push(x.data.trim());
        }
      }
      return { ok: true, addresses };
    }

    if (cname) {
      name = normalizeCnameTarget(cname.data);
      continue;
    }

    const aaaaResp = await dnsJsonQuery(name, 28, fetchFn);
    if (!aaaaResp) {
      return { ok: false, reason: 'Could not verify hostname DNS (lookup failed)' };
    }
    if (aaaaResp.status !== 0 && aaaaResp.status !== 3) {
      return { ok: false, reason: 'Could not verify hostname DNS (resolver error)' };
    }
    const aaaas = aaaaResp.answers.filter((x) => x.type === 28).map((x) => x.data.trim());
    const cname6 = aaaaResp.answers.find((x) => x.type === 5);
    if (aaaas.length > 0) {
      for (const ip of aaaas) {
        addresses.push(ip);
      }
      return { ok: true, addresses };
    }
    if (cname6) {
      name = normalizeCnameTarget(cname6.data);
      continue;
    }

    if (aResp.status === 3 && aaaaResp.status === 3) {
      return { ok: false, reason: 'Could not verify hostname DNS (name not found)' };
    }

    return { ok: false, reason: 'Could not verify hostname DNS (no address records)' };
  }

  return { ok: false, reason: 'Could not verify hostname DNS (CNAME chain too long)' };
}

export type OutboundUrlResolveResult = { ok: true } | { ok: false; reason: string };

/**
 * After {@link isSafeHttpsOutboundUrl}, resolve hostname via public DNS and reject private/link-local ranges.
 * Literal IP hosts in the URL skip DNS (already validated synchronously).
 */
export async function assertHttpsOutboundUrlResolvedSafe(
  urlString: string,
  fetchFn: typeof fetch,
): Promise<OutboundUrlResolveResult> {
  if (!isSafeHttpsOutboundUrl(urlString)) {
    return {
      ok: false,
      reason:
        'url must be a public https URL (private IPs, localhost, and metadata endpoints are not allowed)',
    };
  }

  let u: URL;
  try {
    u = new URL(urlString.trim());
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  const host = u.hostname;
  if (!host) {
    return { ok: false, reason: 'Invalid URL' };
  }

  if (parseIpv4Literal(host) || host.includes(':')) {
    return { ok: true };
  }

  const resolved = await resolvedAddressesForHostname(host, fetchFn);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.addresses.length === 0) {
    return { ok: false, reason: 'Could not verify hostname DNS (no address records)' };
  }
  for (const addr of resolved.addresses) {
    if (isBlockedResolvedAddress(addr)) {
      return {
        ok: false,
        reason:
          'url hostname resolves to a private or disallowed address (DNS rebinding / SSRF mitigation)',
      };
    }
  }
  return { ok: true };
}

/** Sync checks plus DNS for each `send_webhook` action URL. */
export async function assertSendWebhookActionsDnsSafe(
  actions: unknown,
  fetchFn: typeof fetch,
): Promise<OutboundUrlResolveResult> {
  const syncErr = unsafeSendWebhookUrlInActions(actions);
  if (syncErr) {
    return { ok: false, reason: syncErr };
  }
  if (!Array.isArray(actions)) {
    return { ok: true };
  }
  for (const item of actions) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const a = item as { type?: string; params?: Record<string, string> };
    if (a.type !== 'send_webhook') {
      continue;
    }
    const url = a.params?.url?.trim() ?? '';
    if (!url) {
      continue;
    }
    const r = await assertHttpsOutboundUrlResolvedSafe(url, fetchFn);
    if (!r.ok) {
      return r;
    }
  }
  return { ok: true };
}
