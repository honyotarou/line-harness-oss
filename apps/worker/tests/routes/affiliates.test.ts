import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getAffiliates: vi.fn(),
  getAffiliateById: vi.fn(),
  getAffiliateByCode: vi.fn(),
  createAffiliate: vi.fn(),
  updateAffiliate: vi.fn(),
  deleteAffiliate: vi.fn(),
  recordAffiliateClick: vi.fn(),
  getAffiliateReport: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

describe('affiliate routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('serializes affiliates in list responses', async () => {
    dbMocks.getAffiliates.mockResolvedValue([
      {
        id: 'affiliate-1',
        name: 'Partner',
        code: 'partner-1',
        commission_rate: 15,
        is_active: 1,
        created_at: '2026-03-26T10:00:00+09:00',
      },
    ]);

    const { affiliates } = await import('../../src/routes/affiliates.js');
    const app = new Hono();
    app.route('/', affiliates);

    const response = await app.fetch(
      new Request('http://localhost/api/affiliates'),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'affiliate-1',
          name: 'Partner',
          code: 'partner-1',
          commissionRate: 15,
          isActive: true,
          createdAt: '2026-03-26T10:00:00+09:00',
        },
      ],
    });
  });

  it('records public affiliate clicks with the request IP address', async () => {
    dbMocks.getAffiliateByCode.mockResolvedValue({
      id: 'affiliate-1',
      name: 'Partner',
      code: 'partner-1',
      commission_rate: 15,
      is_active: 1,
      created_at: '2026-03-26T10:00:00+09:00',
    });
    dbMocks.recordAffiliateClick.mockResolvedValue({
      id: 'click-1',
      affiliate_id: 'affiliate-1',
      url: 'https://example.com/campaign',
      ip_address: '203.0.113.10',
      created_at: '2026-03-26T10:00:00+09:00',
    });

    const { affiliates } = await import('../../src/routes/affiliates.js');
    const app = new Hono();
    app.route('/', affiliates);

    const response = await app.fetch(
      new Request('http://localhost/api/affiliates/click', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.10',
        },
        body: JSON.stringify({
          code: 'partner-1',
          url: 'https://example.com/campaign',
        }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(201);
    expect(dbMocks.recordAffiliateClick).toHaveBeenCalledWith(
      expect.anything(),
      'affiliate-1',
      'https://example.com/campaign',
      '203.0.113.10',
    );
  });
});
