/**
 * Cycle 1 — Attacker view: public POST /api/affiliates/click can inflate metrics / DB without rate limits.
 */
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRequestRateLimits } from '../../src/services/request-rate-limit.js';

const dbMocks = vi.hoisted(() => ({
  getAffiliateByCode: vi.fn(),
  recordAffiliateClick: vi.fn(),
}));

vi.mock('@line-crm/db', () => ({
  getAffiliates: vi.fn(),
  getAffiliateById: vi.fn(),
  getAffiliateByCode: dbMocks.getAffiliateByCode,
  createAffiliate: vi.fn(),
  updateAffiliate: vi.fn(),
  deleteAffiliate: vi.fn(),
  recordAffiliateClick: dbMocks.recordAffiliateClick,
  getAffiliateReport: vi.fn(),
}));

describe('Cycle 1: affiliate click rate limit', () => {
  beforeEach(() => {
    resetRequestRateLimits();
    dbMocks.getAffiliateByCode.mockReset();
    dbMocks.recordAffiliateClick.mockReset();
    dbMocks.getAffiliateByCode.mockResolvedValue({
      id: 'affiliate-1',
      name: 'Partner',
      code: 'partner-1',
      commission_rate: 15,
      is_active: 1,
      created_at: '2026-03-26T10:00:00+09:00',
    });
    dbMocks.recordAffiliateClick.mockResolvedValue({} as never);
  });

  afterEach(() => {
    resetRequestRateLimits();
  });

  it('returns 429 after too many clicks from the same client IP in one window', async () => {
    const { affiliates } = await import('../../src/routes/affiliates.js');
    const app = new Hono();
    app.route('/', affiliates);

    let lastStatus = 0;
    for (let i = 0; i < 35; i += 1) {
      const res = await app.fetch(
        new Request('http://localhost/api/affiliates/click', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '198.51.100.1',
          },
          body: JSON.stringify({ code: 'partner-1' }),
        }),
        { DB: {} as D1Database } as never,
      );
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
    expect(dbMocks.recordAffiliateClick).toHaveBeenCalledTimes(30);
  });
});
