import { buildAllowedOrigins, type AllowedOriginsEnv } from './allowed-origins.js';

/**
 * Returns a safe absolute https URL for post-login / LIFF `redirect=`, or null if disallowed.
 * Blocks `javascript:`, `data:`, protocol-relative `//`, and unknown https origins.
 */
export function resolveSafeRedirectUrl(redirect: string, env: AllowedOriginsEnv): string | null {
  const t = redirect.trim();
  if (!t) return null;

  const allowed = new Set(buildAllowedOrigins(env));
  for (const o of ['https://line.me', 'https://access.line.me', 'https://liff.line.me']) {
    allowed.add(o);
  }

  try {
    if (t.startsWith('/') && !t.startsWith('//')) {
      const base = env.WEB_URL || env.WORKER_URL;
      if (!base) return null;
      const normalizedBase = base.endsWith('/') ? base : `${base}/`;
      const resolved = new URL(t, normalizedBase);
      if (!allowed.has(resolved.origin)) return null;
      return resolved.href;
    }

    const u = new URL(t);
    if (u.protocol !== 'https:') return null;
    if (!allowed.has(u.origin)) return null;
    return u.href;
  } catch {
    return null;
  }
}
