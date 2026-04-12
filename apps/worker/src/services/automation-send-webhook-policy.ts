/**
 * Optional host allowlist for automation `send_webhook` (defense in depth on top of SSRF checks).
 */

/** Split comma-separated env; lowercase; drop empties. */
export function parseAutomationSendWebhookHostAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * When `rules` is empty, callers should skip this gate (backward compatible).
 * Rule starting with `.` → suffix match on hostname (e.g. `.slack.com` matches `hooks.slack.com`).
 * Otherwise → exact hostname match (case-insensitive via pre-lowercased rules).
 */
export function automationSendWebhookHostnameAllowed(hostname: string, rules: string[]): boolean {
  if (rules.length === 0) {
    return true;
  }
  const h = hostname.trim().toLowerCase();
  if (!h) {
    return false;
  }
  for (const r of rules) {
    if (r.startsWith('.')) {
      const suffix = r;
      const root = r.slice(1);
      if (h === root || h.endsWith(suffix)) {
        return true;
      }
    } else if (h === r) {
      return true;
    }
  }
  return false;
}
