import { buildAllowedOrigins } from './cors-policy.js';

export type LiffRedirectEnv = {
  WEB_URL?: string;
  WORKER_URL?: string;
  LIFF_URL?: string;
  ALLOWED_ORIGINS?: string;
};

/**
 * Returns a safe absolute URL to redirect to after OAuth, or null if disallowed (open redirect hardening).
 */
export function resolveSafeRedirectUrl(redirect: string, env: LiffRedirectEnv): string | null {
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
    const localhostHttp =
      u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
    if (u.protocol !== 'https:' && !localhostHttp) return null;
    if (!allowed.has(u.origin)) return null;
    return u.href;
  } catch {
    return null;
  }
}
