import type { Context } from 'hono';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitOptions = {
  bucket: string;
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type RateLimitStorageOptions = RateLimitOptions & {
  db?: D1Database | null;
};

const entries = new Map<string, RateLimitEntry>();
let requestsSinceCleanup = 0;

function pruneExpiredEntries(now: number): void {
  for (const [entryKey, entry] of entries.entries()) {
    if (entry.resetAt <= now) {
      entries.delete(entryKey);
    }
  }
}

function maybeCleanup(now: number): void {
  requestsSinceCleanup += 1;
  if (entries.size > 1_000 || requestsSinceCleanup % 128 === 0) {
    pruneExpiredEntries(now);
  }
}

export function resetRequestRateLimits(): void {
  entries.clear();
  requestsSinceCleanup = 0;
}

export function getRequestClientAddress(request: Request): string {
  const cfConnectingIp = request.headers.get('CF-Connecting-IP');
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }

  const xForwardedFor = request.headers.get('X-Forwarded-For');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0]?.trim() || 'anonymous';
  }

  const xRealIp = request.headers.get('X-Real-IP');
  if (xRealIp) {
    return xRealIp.trim();
  }

  return 'anonymous';
}

export function checkRateLimit(options: RateLimitOptions): RateLimitDecision {
  const now = options.now ?? Date.now();
  maybeCleanup(now);

  const scopedKey = `${options.bucket}:${options.key}`;
  let entry = entries.get(scopedKey);

  if (!entry || entry.resetAt <= now) {
    entry = {
      count: 0,
      resetAt: now + options.windowMs,
    };
    entries.set(scopedKey, entry);
  }

  if (entry.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)),
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: Math.max(options.limit - entry.count, 0),
    resetAt: entry.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)),
  };
}

export async function checkRateLimitWithDb(
  db: D1Database,
  options: RateLimitOptions,
): Promise<RateLimitDecision> {
  const now = options.now ?? Date.now();
  const windowStartedAt = Math.floor(now / options.windowMs) * options.windowMs;
  const resetAt = windowStartedAt + options.windowMs;
  const nowIso = new Date(now).toISOString();

  await db
    .prepare(
      `INSERT INTO request_rate_limits (bucket, subject_key, window_started_at, count, updated_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(bucket, subject_key, window_started_at)
       DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`,
    )
    .bind(options.bucket, options.key, windowStartedAt, nowIso)
    .run();

  const current = await db
    .prepare(
      `SELECT count FROM request_rate_limits
       WHERE bucket = ? AND subject_key = ? AND window_started_at = ?`,
    )
    .bind(options.bucket, options.key, windowStartedAt)
    .first<{ count: number }>();

  const count = current?.count ?? 0;

  // Opportunistic cleanup of stale windows to avoid unbounded growth.
  if (now % 32 === 0) {
    const staleBefore = windowStartedAt - options.windowMs * 2;
    await db
      .prepare(`DELETE FROM request_rate_limits WHERE window_started_at < ?`)
      .bind(staleBefore)
      .run();
  }

  return {
    allowed: count <= options.limit,
    remaining: Math.max(options.limit - count, 0),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1_000)),
  };
}

export async function checkRateLimitWithStorage(
  options: RateLimitStorageOptions,
): Promise<RateLimitDecision> {
  if (options.db && typeof options.db.prepare === 'function') {
    return checkRateLimitWithDb(options.db, options);
  }

  return checkRateLimit(options);
}

export async function enforceRateLimit(
  c: Context,
  options: Omit<RateLimitStorageOptions, 'key' | 'now'>,
): Promise<Response | null> {
  const decision = await checkRateLimitWithStorage({
    ...options,
    key: getRequestClientAddress(c.req.raw),
  });

  c.header('X-RateLimit-Limit', String(options.limit));
  c.header('X-RateLimit-Remaining', String(decision.remaining));
  c.header('X-RateLimit-Reset', String(Math.ceil(decision.resetAt / 1_000)));

  if (decision.allowed) {
    return null;
  }

  c.header('Retry-After', String(decision.retryAfterSeconds));
  return c.json({ success: false, error: 'Too many requests' }, 429);
}
