import type { D1Database } from '@cloudflare/workers-types';

/**
 * In-memory D1 shape for {@link checkRateLimitWithDb} (used by {@link enforceRateLimit} in routes).
 */
export function createRateLimitD1Stub(): D1Database {
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
