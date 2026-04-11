import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { cfBotGuardMiddleware } from '../../src/middleware/cf-bot-guard.js';
import type { Env } from '../../src/index.js';

function attachCf(req: Request, cf: unknown) {
  Object.defineProperty(req, 'cf', { value: cf, configurable: true });
  return req;
}

describe('cfBotGuardMiddleware', () => {
  it('returns 403 on POST /api/auth/login when score is below MIN_CF_BOT_SCORE', async () => {
    const app = new Hono<Env>();
    app.use('*', cfBotGuardMiddleware);
    app.post('/api/auth/login', (c) => c.json({ ok: true }));

    const raw = new Request('http://localhost/api/auth/login', { method: 'POST' });
    attachCf(raw, { botManagement: { score: 10 } });

    const res = await app.fetch(raw, {
      DB: {} as D1Database,
      API_KEY: 'x'.repeat(32),
      MIN_CF_BOT_SCORE: '30',
    } as never);

    expect(res.status).toBe(403);
  });

  it('passes through when score meets threshold', async () => {
    const app = new Hono<Env>();
    app.use('*', cfBotGuardMiddleware);
    app.post('/api/auth/login', (c) => c.json({ ok: true }));

    const raw = new Request('http://localhost/api/auth/login', { method: 'POST' });
    attachCf(raw, { botManagement: { score: 90 } });

    const res = await app.fetch(raw, {
      DB: {} as D1Database,
      API_KEY: 'x'.repeat(32),
      MIN_CF_BOT_SCORE: '30',
    } as never);

    expect(res.status).toBe(200);
  });

  it('does not inspect GET /health', async () => {
    const app = new Hono<Env>();
    app.use('*', cfBotGuardMiddleware);
    app.get('/health', (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request('http://localhost/health'), {
      DB: {} as D1Database,
      API_KEY: 'x'.repeat(32),
      MIN_CF_BOT_SCORE: '99',
    } as never);

    expect(res.status).toBe(200);
  });
});
