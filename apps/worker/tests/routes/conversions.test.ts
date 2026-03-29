import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getConversionPoints: vi.fn(),
  getConversionPointById: vi.fn(),
  createConversionPoint: vi.fn(),
  deleteConversionPoint: vi.fn(),
  trackConversion: vi.fn(),
  getConversionEvents: vi.fn(),
  getConversionReport: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

describe('conversion routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('creates a conversion point with serialized fields', async () => {
    dbMocks.createConversionPoint.mockResolvedValue({
      id: 'point-1',
      name: 'Purchase',
      event_type: 'purchase',
      value: 5000,
      created_at: '2026-03-26T10:00:00+09:00',
    });

    const { conversions } = await import('../../src/routes/conversions.js');
    const app = new Hono();
    app.route('/', conversions);

    const response = await app.fetch(
      new Request('http://localhost/api/conversions/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Purchase',
          eventType: 'purchase',
          value: 5000,
        }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'point-1',
        name: 'Purchase',
        eventType: 'purchase',
        value: 5000,
        createdAt: '2026-03-26T10:00:00+09:00',
      },
    });
  });

  it('stringifies conversion metadata before persistence', async () => {
    dbMocks.trackConversion.mockResolvedValue({
      id: 'event-1',
      conversion_point_id: 'point-1',
      friend_id: 'friend-1',
      user_id: 'user-1',
      affiliate_code: 'partner-1',
      metadata: '{"orderId":"order-1"}',
      created_at: '2026-03-26T10:00:00+09:00',
    });

    const { conversions } = await import('../../src/routes/conversions.js');
    const app = new Hono();
    app.route('/', conversions);

    const response = await app.fetch(
      new Request('http://localhost/api/conversions/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversionPointId: 'point-1',
          friendId: 'friend-1',
          userId: 'user-1',
          affiliateCode: 'partner-1',
          metadata: { orderId: 'order-1' },
        }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(201);
    expect(dbMocks.trackConversion).toHaveBeenCalledWith(expect.anything(), {
      conversionPointId: 'point-1',
      friendId: 'friend-1',
      userId: 'user-1',
      affiliateCode: 'partner-1',
      metadata: '{"orderId":"order-1"}',
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'event-1',
        conversionPointId: 'point-1',
        friendId: 'friend-1',
        userId: 'user-1',
        affiliateCode: 'partner-1',
        metadata: '{"orderId":"order-1"}',
        createdAt: '2026-03-26T10:00:00+09:00',
      },
    });
  });
});
