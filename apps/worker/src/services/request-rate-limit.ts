import type { Context } from 'hono';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitOptions = Readonly<{
  bucket: string;
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}>;

export type RateLimitDecision = Readonly<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}>;

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

function isLocalDevHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

/**
 * Prefer `CF-Connecting-IP` (trusted on Cloudflare). Avoid trusting `X-Forwarded-For` on public
 * hostnames — it is spoofable when the Worker is reached without CF inserting the real client IP.
 */
export function getRequestClientAddress(request: Request): string {
  const cfConnectingIp = request.headers.get('CF-Connecting-IP');
  if (cfConnectingIp) {
    const t = cfConnectingIp.trim();
    if (t) {
      return t;
    }
  }

  let hostname = '';
  try {
    hostname = new URL(request.url).hostname;
  } catch {
    hostname = '';
  }

  if (isLocalDevHostname(hostname)) {
    const xForwardedFor = request.headers.get('X-Forwarded-For');
    if (xForwardedFor) {
      return xForwardedFor.split(',')[0]?.trim() || 'local';
    }
    const xRealIp = request.headers.get('X-Real-IP');
    if (xRealIp?.trim()) {
      return xRealIp.trim();
    }
    return 'local';
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

/**
 * Atomically consumes one slot in the D1-backed window if under the limit.
 * Unlike {@link checkRateLimitWithDb}, failed attempts do not inflate `count` past the cap
 * (needed for wait/retry loops such as stealth LINE multicast pacing).
 */
export async function consumeRateLimitSlotDb(
  db: D1Database,
  options: RateLimitOptions,
): Promise<RateLimitDecision> {
  const now = options.now ?? Date.now();
  const windowStartedAt = Math.floor(now / options.windowMs) * options.windowMs;
  const resetAt = windowStartedAt + options.windowMs;
  const nowIso = new Date(now).toISOString();

  const result = await db
    .prepare(
      `INSERT INTO request_rate_limits (bucket, subject_key, window_started_at, count, updated_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(bucket, subject_key, window_started_at) DO UPDATE SET
         count = request_rate_limits.count + 1,
         updated_at = excluded.updated_at
       WHERE request_rate_limits.count < ?`,
    )
    .bind(options.bucket, options.key, windowStartedAt, nowIso, options.limit)
    .run();

  const changes = result.meta?.changes ?? 0;
  const allowed = changes > 0;

  if (now % 64 === 0) {
    const staleBefore = windowStartedAt - options.windowMs * 2;
    await db
      .prepare(`DELETE FROM request_rate_limits WHERE window_started_at < ?`)
      .bind(staleBefore)
      .run();
  }

  const row = await db
    .prepare(
      `SELECT count FROM request_rate_limits
       WHERE bucket = ? AND subject_key = ? AND window_started_at = ?`,
    )
    .bind(options.bucket, options.key, windowStartedAt)
    .first<{ count: number }>();

  const count = row?.count ?? 0;
  const remaining = Math.max(options.limit - count, 0);

  return {
    allowed,
    remaining,
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1_000)),
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

/**
 * Brute-force / abuse-sensitive buckets must not rely on per-isolate memory (Workers scale out).
 * Auth endpoints and per-IP webhook / public-form abstractions use D1 when bound; callers still
 * pass `db: c.env.DB` for other buckets so misconfigured Workers get consistent storage when present.
 */
export function rateLimitBucketRequiresD1(bucket: string): boolean {
  if (bucket.startsWith('incoming-webhook:')) return true;
  if (bucket.startsWith('public-form-submit:')) return true;
  return bucket === 'auth-login' || bucket === 'auth-session';
}

/** Do not expose remaining budget in headers for auth endpoints (information leak). */
const RATE_LIMIT_OMIT_HEADER_BUCKETS = new Set(['auth-login', 'auth-session']);

export type EnforceRateLimitOptions = Omit<RateLimitStorageOptions, 'key' | 'now'> & {
  /** When set, replaces client-IP keying (e.g. per Bearer session for mass-send endpoints). */
  resolveKey?: (req: Request) => Promise<string> | string;
};

/**
 * Stable rate-limit subject for authenticated admin mass-send routes: hash Bearer token when
 * present, else fall back to {@link getRequestClientAddress}.
 */
export async function massSendAdminRateLimitKey(request: Request): Promise<string> {
  const auth = request.headers.get('Authorization')?.trim() ?? '';
  if (auth.startsWith('Bearer ') && auth.length > 14) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(auth));
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `bearer:${hex.slice(0, 40)}`;
  }
  return `ip:${getRequestClientAddress(request)}`;
}

export async function enforceRateLimit(
  c: Context,
  options: EnforceRateLimitOptions,
): Promise<Response | null> {
  if (rateLimitBucketRequiresD1(options.bucket)) {
    if (!options.db || typeof options.db.prepare !== 'function') {
      return c.json(
        {
          success: false,
          error: 'Server misconfigured: D1 database binding required for this rate limit bucket',
        },
        503,
      );
    }
  }

  const { resolveKey, ...rest } = options;
  const key = resolveKey
    ? await Promise.resolve(resolveKey(c.req.raw))
    : getRequestClientAddress(c.req.raw);

  const decision = await checkRateLimitWithStorage({
    ...rest,
    key,
  });

  if (!RATE_LIMIT_OMIT_HEADER_BUCKETS.has(options.bucket)) {
    c.header('X-RateLimit-Limit', String(options.limit));
    c.header('X-RateLimit-Remaining', String(decision.remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(decision.resetAt / 1_000)));
  }

  if (decision.allowed) {
    return null;
  }

  c.header('Retry-After', String(decision.retryAfterSeconds));
  return c.json({ success: false, error: 'Too many requests' }, 429);
}
