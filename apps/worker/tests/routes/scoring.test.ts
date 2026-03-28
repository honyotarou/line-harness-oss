import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getScoringRules: vi.fn(),
  getScoringRuleById: vi.fn(),
  createScoringRule: vi.fn(),
  updateScoringRule: vi.fn(),
  deleteScoringRule: vi.fn(),
  getFriendScore: vi.fn(),
  getFriendScoreHistory: vi.fn(),
  addScore: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

describe('scoring routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('returns the full scoring rule payload when creating a rule', async () => {
    dbMocks.createScoringRule.mockResolvedValue({
      id: 'rule-1',
      name: 'Purchase',
      event_type: 'purchase',
      score_value: 20,
      is_active: 1,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });

    const { scoring } = await import('../../src/routes/scoring.js');
    const app = new Hono();
    app.route('/', scoring);

    const response = await app.fetch(
      new Request('http://localhost/api/scoring-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Purchase',
          eventType: 'purchase',
          scoreValue: 20,
        }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'rule-1',
        name: 'Purchase',
        eventType: 'purchase',
        scoreValue: 20,
        isActive: true,
        createdAt: '2026-03-25T10:00:00+09:00',
        updatedAt: '2026-03-26T10:00:00+09:00',
      },
    });
  });

  it('returns updatedAt when fetching a single scoring rule', async () => {
    dbMocks.getScoringRuleById.mockResolvedValue({
      id: 'rule-1',
      name: 'Purchase',
      event_type: 'purchase',
      score_value: 20,
      is_active: 1,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });

    const { scoring } = await import('../../src/routes/scoring.js');
    const app = new Hono();
    app.route('/', scoring);

    const response = await app.fetch(
      new Request('http://localhost/api/scoring-rules/rule-1'),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'rule-1',
        name: 'Purchase',
        eventType: 'purchase',
        scoreValue: 20,
        isActive: true,
        createdAt: '2026-03-25T10:00:00+09:00',
        updatedAt: '2026-03-26T10:00:00+09:00',
      },
    });
  });
});
