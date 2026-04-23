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
  getFriendById: vi.fn(),
  listPrincipalLineAccountIdsForEmail: vi.fn(),
}));

vi.mock('@line-crm/db', async (importOriginal) => {
  const o = await importOriginal<typeof import('@line-crm/db')>();
  return { ...o, ...dbMocks };
});

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

    const response = await app.fetch(new Request('http://localhost/api/scoring-rules/rule-1'), {
      DB: {} as D1Database,
    } as never);

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

  it('rejects manual scoreChange outside the allowed range', async () => {
    const { scoring } = await import('../../src/routes/scoring.js');
    const app = new Hono();
    app.route('/', scoring);

    const response = await app.fetch(
      new Request('http://localhost/api/friends/f1/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scoreChange: 999_999 }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(400);
    expect(dbMocks.addScore).not.toHaveBeenCalled();
  });

  it('GET /api/friends/:id/score returns 404 when the friend belongs to another tenant (F5a)', async () => {
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-B',
      line_account_id: 'acc-B',
      line_user_id: 'U',
      display_name: 'B',
      metadata: '{}',
      picture_url: null,
      status_message: null,
      is_following: 1,
      user_id: null,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue(['acc-A']);

    const { scoring } = await import('../../src/routes/scoring.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', scoring);

    const response = await app.fetch(new Request('http://localhost/api/friends/friend-B/score'), {
      DB: {} as D1Database,
      API_KEY: 'k',
      REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
    } as never);

    expect(response.status).toBe(404);
    expect(dbMocks.getFriendScore).not.toHaveBeenCalled();
    expect(dbMocks.getFriendScoreHistory).not.toHaveBeenCalled();
  });

  it('POST /api/friends/:id/score returns 404 and does NOT addScore on cross-tenant friend (F5a)', async () => {
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-B',
      line_account_id: 'acc-B',
      line_user_id: 'U',
      display_name: 'B',
      metadata: '{}',
      picture_url: null,
      status_message: null,
      is_following: 1,
      user_id: null,
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue(['acc-A']);

    const { scoring } = await import('../../src/routes/scoring.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', scoring);

    const response = await app.fetch(
      new Request('http://localhost/api/friends/friend-B/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scoreChange: -500, reason: 'sabotage' }),
      }),
      {
        DB: {} as D1Database,
        API_KEY: 'k',
        REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      } as never,
    );

    expect(response.status).toBe(404);
    expect(dbMocks.addScore).not.toHaveBeenCalled();
  });
});
