const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
];

type CorsEnv = {
  WEB_URL?: string;
  WORKER_URL?: string;
  LIFF_URL?: string;
  ALLOWED_ORIGINS?: string;
};

function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function buildAllowedOrigins(env: CorsEnv): string[] {
  const origins = new Set<string>(DEFAULT_DEV_ORIGINS);

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
