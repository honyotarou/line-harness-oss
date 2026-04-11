/**
 * DNS rebinding / Host-header hardening: when `ALLOWED_HOSTNAMES` is set, reject requests
 * whose `Host` does not match an entry (case-insensitive, port ignored).
 */

/** Normalize `Host` header value to lowercase hostname (no port). Returns null if invalid. */
export function hostnameFromHostHeader(host: string | undefined | null): string | null {
  if (host == null) {
    return null;
  }
  const trimmed = host.trim();
  if (!trimmed) {
    return null;
  }
  // Reject control characters: WHATWG URL strips CR/LF inside the authority, which can turn
  // `exam\nple.com` into `example.com` and obscures the real Host header in logs / upstreams.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return null;
  }
  try {
    const { hostname } = new URL(`http://${trimmed}`);
    if (!hostname) {
      return null;
    }
    let h = hostname.toLowerCase();
    // Node may return `[::1]`; normalize to `::1` so allowlists match bracketed Host headers.
    if (h.startsWith('[') && h.endsWith(']')) {
      h = h.slice(1, -1);
    }
    return h;
  } catch {
    return null;
  }
}

function normalizeAllowedEntry(entry: string): string | null {
  const t = entry.trim();
  if (!t) {
    return null;
  }
  return hostnameFromHostHeader(t);
}

/** Comma-separated allowlist from env (no wildcards). */
export function parseAllowedHostnames(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!raw) {
    return out;
  }
  for (const part of raw.split(',')) {
    const h = normalizeAllowedEntry(part);
    if (h) {
      out.add(h);
    }
  }
  return out;
}

export function shouldEnforceHostAllowlist(raw: string | undefined): boolean {
  return parseAllowedHostnames(raw).size > 0;
}

export function isHostAllowed(
  hostHeader: string | undefined | null,
  allowed: Set<string>,
): boolean {
  if (allowed.size === 0) {
    return true;
  }
  const host = hostnameFromHostHeader(hostHeader);
  if (!host) {
    return false;
  }
  return allowed.has(host);
}
