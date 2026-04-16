import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { issueAdminSessionToken } from '../../src/services/admin-session.js';

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

  it('returns 401 without credentials when probe is enabled (non-strict WORKER_URL)', async () => {
    const { envProbe } = await import('../../src/routes/env-probe.js');
    const app = new Hono();
    app.route('/', envProbe);

    const db = { prepare: () => ({}) } as unknown as D1Database;
    const res = await app.fetch(new Request('http://localhost/api/_debug/env-probe'), {
      DB: db,
      API_KEY: 'k',
      // Strict HTTPS surfaces never expose env-probe; use http so this route is testable.
      WORKER_URL: 'http://127.0.0.1:8787',
      ALLOW_WORKER_ENV_PROBE: '1',
      ADMIN_SESSION_SECRET: 'secret',
    } as never);
    expect(res.status).toBe(401);
  });

  it('returns booleans only when ALLOW_WORKER_ENV_PROBE is on and session is valid (non-strict WORKER_URL)', async () => {
    const { envProbe } = await import('../../src/routes/env-probe.js');
    const app = new Hono();
    app.route('/', envProbe);

    const token = await issueAdminSessionToken('secret');
    const db = {
      prepare() {
        return {
          bind: () => ({
            async first() {
              return null;
            },
            async run() {
              return { success: true };
            },
          }),
        };
      },
    } as unknown as D1Database;
    const res = await app.fetch(
      new Request('http://localhost/api/_debug/env-probe', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      {
        DB: db,
        API_KEY: 'k',
        WORKER_URL: 'http://127.0.0.1:8787',
        ALLOW_WORKER_ENV_PROBE: '1',
        ADMIN_SESSION_SECRET: 'secret',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      } as never,
    );
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
      workerUrlHost: '127.0.0.1',
    });
    expect(JSON.stringify(json)).not.toContain('secret');
  });

  it('returns 404 on strict HTTPS even when probe is enabled and session is valid', async () => {
    const { envProbe } = await import('../../src/routes/env-probe.js');
    const app = new Hono();
    app.route('/', envProbe);

    const token = await issueAdminSessionToken('secret');
    const db = {
      prepare() {
        return {
          bind: () => ({
            async first() {
              return null;
            },
            async run() {
              return { success: true };
            },
          }),
        };
      },
    } as unknown as D1Database;
    const res = await app.fetch(
      new Request('http://localhost/api/_debug/env-probe', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      {
        DB: db,
        API_KEY: 'k',
        WORKER_URL: 'https://api.example.com',
        ALLOW_WORKER_ENV_PROBE: '1',
        ADMIN_SESSION_SECRET: 'secret',
      } as never,
    );
    expect(res.status).toBe(404);
  });
});
