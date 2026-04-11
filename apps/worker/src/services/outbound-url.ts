/**
 * SSRF mitigation for server-initiated HTTPS fetches (outgoing webhooks, automation send_webhook).
 * Hostname-based only; does not follow redirects (fetch caller should not follow redirects if added later).
 */

function normalizeIpv6Host(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1).toLowerCase();
  }
  return hostname.toLowerCase();
}

function parseIpv4(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1, 5).map((x) => Number(x));
  if (parts.some((n) => n > 255)) return null;
  return parts as [number, number, number, number];
}

function isBlockedIpv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** IPv4-mapped IPv6 tail: dotted quad or 32-bit as two hextets (Node may normalize to ::ffff:7f00:1). */
function parseIpv4MappedIpv6Tail(lower: string): [number, number, number, number] | null {
  if (!lower.startsWith('::ffff:')) return null;
  const rest = lower.slice('::ffff:'.length);
  const dotted = parseIpv4(rest);
  if (dotted) return dotted;
  const m2 = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(rest);
  if (!m2) return null;
  const hi = parseInt(m2[1], 16);
  const lo = parseInt(m2[2], 16);
  if (hi > 0xffff || lo > 0xffff) return null;
  const addr32 = (hi << 16) | lo;
  return [(addr32 >>> 24) & 0xff, (addr32 >>> 16) & 0xff, (addr32 >>> 8) & 0xff, addr32 & 0xff];
}

function isBlockedIpv6(ip: string): boolean {
  if (ip === '::1') return true;
  const lower = ip.toLowerCase();
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  const mappedV4 = parseIpv4MappedIpv6Tail(lower);
  if (mappedV4 && isBlockedIpv4(mappedV4)) return true;
  return false;
}

export function isSafeHttpsOutboundUrl(urlString: string): boolean {
  const trimmed = urlString.trim();
  if (!trimmed) return false;

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return false;
  }

  if (u.protocol !== 'https:') return false;
  if (u.username !== '' || u.password !== '') return false;

  const hostRaw = u.hostname;
  if (!hostRaw) return false;

  const hostLower = hostRaw.toLowerCase();
  if (hostLower === 'localhost' || hostLower.endsWith('.localhost')) return false;

  const ipv4 = parseIpv4(hostLower);
  if (ipv4) {
    return !isBlockedIpv4(ipv4);
  }

  const ipv6 = normalizeIpv6Host(hostRaw);
  if (ipv6.includes(':')) {
    return !isBlockedIpv6(ipv6);
  }

  return true;
}

/** Returns an error message if any `send_webhook` action has a disallowed URL; otherwise null. */
export function unsafeSendWebhookUrlInActions(actions: unknown): string | null {
  if (!Array.isArray(actions)) return null;
  for (const item of actions) {
    if (!item || typeof item !== 'object') continue;
    const a = item as { type?: string; params?: Record<string, string> };
    if (a.type !== 'send_webhook') continue;
    const url = a.params?.url?.trim() ?? '';
    if (!url) return 'send_webhook requires params.url';
    if (!isSafeHttpsOutboundUrl(url)) {
      return 'send_webhook URL must be a public https URL (private IPs and localhost are not allowed)';
    }
  }
  return null;
}
