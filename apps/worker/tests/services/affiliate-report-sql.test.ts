import { describe, expect, it, vi } from 'vitest';
import { getAffiliateReport } from '@line-crm/db';

describe('getAffiliateReport (SQL safety)', () => {
  it('binds validated date strings instead of interpolating into SQL', async () => {
    let capturedSql = '';
    let capturedBinds: unknown[] = [];
    const db = {
      prepare(sql: string) {
        capturedSql = sql;
        return {
          bind(...b: unknown[]) {
            capturedBinds = b;
            return {
              all: vi.fn().mockResolvedValue({ results: [] }),
            };
          },
        };
      },
    } as unknown as D1Database;

    await getAffiliateReport(db, 'aff-1', {
      startDate: '2026-01-15',
      endDate: '2026-01-20T00:00:00Z',
    });

    expect(capturedSql).toContain('ac.created_at >= ?');
    expect(capturedSql).toContain('ce.created_at <= ?');
    expect(capturedSql).not.toContain("'2026-01-15'");
    expect(capturedSql).not.toContain("'2026-01-20T00:00:00Z'");
    expect(capturedBinds).toEqual([
      'aff-1',
      '2026-01-15',
      '2026-01-20T00:00:00Z',
      '2026-01-15',
      '2026-01-20T00:00:00Z',
      '2026-01-15',
      '2026-01-20T00:00:00Z',
    ]);
  });
});
