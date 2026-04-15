import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createRateLimitD1Stub } from '../helpers/rate-limit-d1-stub.js';

const createRateLimitDb = createRateLimitD1Stub;

/** Semantics of {@link consumeRateLimitSlotDb} UPSERT + WHERE count < limit (no unbounded increments when capped). */
function createConsumeRateLimitDb() {
  const rows = new Map<string, { count: number }>();

  return {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          return {
            async run() {
              const norm = sql.toLowerCase();
              if (
                norm.includes('insert into request_rate_limits') &&
                norm.includes('on conflict')
              ) {
                const [bucket, subjectKey, windowStartedAt, , limit] = bindings as [
                  string,
                  string,
                  number,
                  string,
                  number,
                ];
                const key = `${bucket}:${subjectKey}:${windowStartedAt}`;
                const row = rows.get(key);
                if (!row) {
                  rows.set(key, { count: 1 });
                  return { success: true, meta: { changes: 1 } };
                }
                if (row.count < limit) {
                  row.count += 1;
                  return { success: true, meta: { changes: 1 } };
                }
                return { success: true, meta: { changes: 0 } };
              }
              if (norm.includes('delete from request_rate_limits')) {
                return { success: true, meta: { changes: 0 } };
              }
              throw new Error(`Unexpected run SQL: ${sql}`);
            },
            async first<T>() {
              if (sql.includes('SELECT count FROM request_rate_limits')) {
                const [bucket, subjectKey, windowStartedAt] = bindings as [string, string, number];
                const key = `${bucket}:${subjectKey}:${windowStartedAt}`;
                const row = rows.get(key);
                return (row ? { count: row.count } : { count: 0 }) as T | null;
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

  it('blocks the 101st D1 consume when limit is 100 within one window (fixed now)', async () => {
    const { checkRateLimitWithDb } = await import('../../src/services/request-rate-limit.js');
    const db = createRateLimitDb();
    const now = Date.UTC(2026, 3, 15, 12, 0, 0, 0);
    const opts = {
      bucket: 'incoming-webhook:global',
      key: '203.0.113.99',
      limit: 100,
      windowMs: 60_000,
      now,
    } as const;

    for (let i = 0; i < 100; i += 1) {
      await expect(checkRateLimitWithDb(db, opts)).resolves.toMatchObject({ allowed: true });
    }
    await expect(checkRateLimitWithDb(db, opts)).resolves.toMatchObject({ allowed: false });
  });

  it('consumeRateLimitSlotDb grants N slots then blocks without further count inflation', async () => {
    const { consumeRateLimitSlotDb } = await import('../../src/services/request-rate-limit.js');
    const db = createConsumeRateLimitDb();
    const now = Date.UTC(2026, 3, 15, 12, 0, 0, 0);
    const opts = { bucket: 'stealth-line', key: 'subj', limit: 3, windowMs: 60_000, now } as const;

    await expect(consumeRateLimitSlotDb(db, opts)).resolves.toMatchObject({ allowed: true });
    await expect(consumeRateLimitSlotDb(db, opts)).resolves.toMatchObject({ allowed: true });
    await expect(consumeRateLimitSlotDb(db, opts)).resolves.toMatchObject({ allowed: true });
    await expect(consumeRateLimitSlotDb(db, opts)).resolves.toMatchObject({ allowed: false });
    await expect(consumeRateLimitSlotDb(db, opts)).resolves.toMatchObject({ allowed: false });
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

  it('returns 503 for incoming-webhook:global when D1 binding is missing', async () => {
    const { enforceRateLimit } = await import('../../src/services/request-rate-limit.js');
    const app = new Hono();
    app.get('/t', async (c) => {
      const blocked = await enforceRateLimit(c, {
        bucket: 'incoming-webhook:global',
        limit: 100,
        windowMs: 60_000,
      });
      return blocked ?? c.text('ok');
    });

    const res = await app.fetch(new Request('http://localhost/t'));
    expect(res.status).toBe(503);
  });

  it('does not emit X-RateLimit-* headers for auth-login (budget leak)', async () => {
    const { enforceRateLimit } = await import('../../src/services/request-rate-limit.js');
    const db = createRateLimitDb();
    const app = new Hono();
    app.get('/t', async (c) => {
      const blocked = await enforceRateLimit(c, {
        bucket: 'auth-login',
        db,
        limit: 2,
        windowMs: 60_000,
      });
      return blocked ?? c.text('ok');
    });

    const ok1 = await app.fetch(new Request('http://localhost/t'));
    expect(ok1.status).toBe(200);
    expect(ok1.headers.get('X-RateLimit-Limit')).toBeNull();
    expect(ok1.headers.get('X-RateLimit-Remaining')).toBeNull();

    const ok2 = await app.fetch(new Request('http://localhost/t'));
    expect(ok2.status).toBe(200);
    expect(ok2.headers.get('X-RateLimit-Limit')).toBeNull();

    const blocked = await app.fetch(new Request('http://localhost/t'));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('X-RateLimit-Limit')).toBeNull();
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });
});
