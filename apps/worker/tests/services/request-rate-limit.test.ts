import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

function createRateLimitDb() {
  const rows = new Map<string, { count: number; updatedAt: number }>();

  return {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async run() {
              if (sql.includes('INSERT INTO request_rate_limits')) {
                const [bucket, subjectKey, windowStartedAt] = bindings as [string, string, number];
                const key = `${bucket}:${subjectKey}:${windowStartedAt}`;
                const current = rows.get(key);
                rows.set(key, {
                  count: (current?.count ?? 0) + 1,
                  updatedAt: Number(windowStartedAt),
                });
                return { success: true };
              }

              if (sql.includes('DELETE FROM request_rate_limits')) {
                const [cutoff] = bindings as [number];
                for (const [key, value] of rows.entries()) {
                  if (value.updatedAt < cutoff) {
                    rows.delete(key);
                  }
                }
                return { success: true };
              }

              throw new Error(`Unexpected run SQL: ${sql}`);
            },
            async first<T>() {
              if (sql.includes('SELECT count FROM request_rate_limits')) {
                const [bucket, subjectKey, windowStartedAt] = bindings as [string, string, number];
                const key = `${bucket}:${subjectKey}:${windowStartedAt}`;
                const row = rows.get(key);
                return (row ? { count: row.count } : null) as T | null;
              }
              throw new Error(`Unexpected first SQL: ${sql}`);
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe('request rate limit helpers', () => {
  it('blocks requests that exceed the configured limit within the active window', async () => {
    const { checkRateLimit, resetRequestRateLimits } = await import(
      '../../src/services/request-rate-limit.js'
    );
    resetRequestRateLimits();

    expect(
      checkRateLimit({
        bucket: 'login',
        key: '198.51.100.40',
        limit: 2,
        windowMs: 60_000,
        now: 1_000,
      }),
    ).toMatchObject({ allowed: true, remaining: 1 });

    expect(
      checkRateLimit({
        bucket: 'login',
        key: '198.51.100.40',
        limit: 2,
        windowMs: 60_000,
        now: 2_000,
      }),
    ).toMatchObject({ allowed: true, remaining: 0 });

    expect(
      checkRateLimit({
        bucket: 'login',
        key: '198.51.100.40',
        limit: 2,
        windowMs: 60_000,
        now: 3_000,
      }),
    ).toMatchObject({ allowed: false, remaining: 0 });
  });

  it('extracts the first client IP from X-Forwarded-For on localhost', async () => {
    const { getRequestClientAddress } = await import('../../src/services/request-rate-limit.js');

    const request = new Request('http://localhost/test', {
      headers: {
        'X-Forwarded-For': '203.0.113.10, 203.0.113.11',
      },
    });

    expect(getRequestClientAddress(request)).toBe('203.0.113.10');
  });

  it('does not trust X-Forwarded-For on non-local hostnames without CF-Connecting-IP', async () => {
    const { getRequestClientAddress } = await import('../../src/services/request-rate-limit.js');

    const request = new Request('https://worker.example.com/test', {
      headers: {
        'X-Forwarded-For': '203.0.113.99',
      },
    });

    expect(getRequestClientAddress(request)).toBe('anonymous');
  });

  it('prefers CF-Connecting-IP when present', async () => {
    const { getRequestClientAddress } = await import('../../src/services/request-rate-limit.js');

    const request = new Request('https://worker.example.com/test', {
      headers: {
        'CF-Connecting-IP': '198.51.100.1',
        'X-Forwarded-For': '203.0.113.99',
      },
    });

    expect(getRequestClientAddress(request)).toBe('198.51.100.1');
  });

  it('persists rate limit counters in D1 when a database is provided', async () => {
    const { checkRateLimitWithDb } = await import('../../src/services/request-rate-limit.js');
    const db = createRateLimitDb();

    await expect(
      checkRateLimitWithDb(db, {
        bucket: 'login',
        key: '198.51.100.41',
        limit: 2,
        windowMs: 60_000,
        now: 1_000,
      }),
    ).resolves.toMatchObject({ allowed: true, remaining: 1 });

    await expect(
      checkRateLimitWithDb(db, {
        bucket: 'login',
        key: '198.51.100.41',
        limit: 2,
        windowMs: 60_000,
        now: 2_000,
      }),
    ).resolves.toMatchObject({ allowed: true, remaining: 0 });

    await expect(
      checkRateLimitWithDb(db, {
        bucket: 'login',
        key: '198.51.100.41',
        limit: 2,
        windowMs: 60_000,
        now: 3_000,
      }),
    ).resolves.toMatchObject({ allowed: false, remaining: 0 });
  });

  it('returns 503 for auth-login when D1 binding is missing (no in-memory brute-force window)', async () => {
    const { enforceRateLimit } = await import('../../src/services/request-rate-limit.js');
    const app = new Hono();
    app.get('/t', async (c) => {
      const blocked = await enforceRateLimit(c, {
        bucket: 'auth-login',
        limit: 5,
        windowMs: 60_000,
      });
      return blocked ?? c.text('ok');
    });

    const res = await app.fetch(new Request('http://localhost/t'));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/D1 database binding required/i),
    });
  });
});
