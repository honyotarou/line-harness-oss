import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

describe('GET /api/_debug/env-probe', () => {
  it('returns 404 when ALLOW_WORKER_ENV_PROBE is unset', async () => {
    const { envProbe } = await import('../../src/routes/env-probe.js');
    const app = new Hono();
    app.route('/', envProbe);

    const res = await app.fetch(new Request('http://localhost/api/_debug/env-probe'), {
      DB: {} as D1Database,
      API_KEY: 'k',
      WORKER_URL: 'https://api.example.com',
    } as never);
    expect(res.status).toBe(404);
  });

  it('returns booleans only when ALLOW_WORKER_ENV_PROBE is on', async () => {
    const { envProbe } = await import('../../src/routes/env-probe.js');
    const app = new Hono();
    app.route('/', envProbe);

    const db = { prepare: () => ({}) } as unknown as D1Database;
    const res = await app.fetch(new Request('http://localhost/api/_debug/env-probe'), {
      DB: db,
      API_KEY: 'k',
      WORKER_URL: 'https://api.example.com',
      ALLOW_WORKER_ENV_PROBE: '1',
      ADMIN_SESSION_SECRET: 'secret',
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
    } as never);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: Record<string, unknown>;
    };
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      hasAdminSessionSecret: true,
      hasApiKey: true,
      hasDb: true,
      hasCloudflareAccessTeamDomain: true,
      requireCloudflareAccessJwt: false,
      workerUrlHost: 'api.example.com',
    });
    expect(JSON.stringify(json)).not.toContain('secret');
  });
});
