/**
 * Origins derived from Worker/LIFF env (CORS and post-login redirect allowlists).
 */

export type AllowedOriginsEnv = Readonly<{
  WEB_URL?: string;
  WORKER_URL?: string;
  LIFF_URL?: string;
  ALLOWED_ORIGINS?: string;
  /**
   * `1` / `true`: drop `*.vercel.app` entries from the computed allow-list unless the hostname
   * exactly matches `WEB_URL` (mitigates unrelated preview/staging origins in `ALLOWED_ORIGINS`).
   */
  CORS_STRICT_VERCEL_ORIGINS?: string;
}>;

export function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  const t = value.trim();
  if (t.toLowerCase() === 'null') {
    return null;
  }

  try {
    return new URL(t).origin;
  } catch {
    return null;
  }
}

/** CORS / redirect: WEB_URL, WORKER_URL, LIFF_URL, and comma-separated ALLOWED_ORIGINS (localhost not implicit). */
export function buildAllowedOrigins(env: AllowedOriginsEnv): string[] {
  const origins = new Set<string>();

  for (const candidate of [env.WEB_URL, env.WORKER_URL, env.LIFF_URL]) {
    const origin = normalizeOrigin(candidate);
    if (origin) {
      origins.add(origin);
    }
  }

  for (const candidate of (env.ALLOWED_ORIGINS ?? '').split(',')) {
    const origin = normalizeOrigin(candidate.trim());
    if (origin) {
      origins.add(origin);
    }
  }

  return [...origins];
}

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * When {@link AllowedOriginsEnv.CORS_STRICT_VERCEL_ORIGINS} is on, removes any `https://*.vercel.app`
 * origin whose hostname does not match `WEB_URL`'s hostname (exact match only for Vercel hosts).
 */
export function filterStrictVercelPreviewOrigins(
  origins: string[],
  env: Pick<AllowedOriginsEnv, 'WEB_URL' | 'CORS_STRICT_VERCEL_ORIGINS'>,
): string[] {
  if (!isTruthyEnvFlag(env.CORS_STRICT_VERCEL_ORIGINS)) {
    return origins;
  }
  const web = normalizeOrigin(env.WEB_URL);
  if (!web) {
    return origins;
  }
  let webHost: string;
  try {
    webHost = new URL(web).hostname.toLowerCase();
  } catch {
    return origins;
  }
  return origins.filter((o) => {
    try {
      const host = new URL(o).hostname.toLowerCase();
      if (host.endsWith('.vercel.app') && host !== webHost) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  });
}

export function isAllowedOrigin(
  origin: string | undefined | null,
  allowedOrigins: Iterable<string>,
): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return false;
  }

  if (allowedOrigins instanceof Set) {
    return allowedOrigins.has(normalized);
  }

  for (const allowed of allowedOrigins) {
    if (allowed === normalized) {
      return true;
    }
  }
  return false;
}
