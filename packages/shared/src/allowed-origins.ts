/**
 * Origins derived from Worker/LIFF env (CORS and post-login redirect allowlists).
 */

export type AllowedOriginsEnv = {
  WEB_URL?: string;
  WORKER_URL?: string;
  LIFF_URL?: string;
  ALLOWED_ORIGINS?: string;
};

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
