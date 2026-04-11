import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetRequestRateLimits } from '../../src/services/request-rate-limit.js';

const enabledEnv = { DB: {} as D1Database, ENABLE_PUBLIC_OPENAPI: '1' } as const;

describe('openapi routes', () => {
  beforeEach(() => {
    resetRequestRateLimits();
  });

  afterEach(() => {
    resetRequestRateLimits();
  });

  it('returns 404 for openapi.json when documentation is not explicitly enabled', async () => {
    const { openapi } = await import('../../src/routes/openapi.js');
    const app = new Hono();
    app.route('/', openapi);

    const response = await app.fetch(new Request('http://localhost/openapi.json'), {
      DB: {} as D1Database,
    } as never);

    expect(response.status).toBe(404);
  });

  it('serves the OpenAPI spec as JSON when ENABLE_PUBLIC_OPENAPI is set', async () => {
    const { openapi } = await import('../../src/routes/openapi.js');
    const app = new Hono();
    app.route('/', openapi);

    const response = await app.fetch(
      new Request('http://localhost/openapi.json'),
      enabledEnv as never,
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      openapi: string;
      info: { title: string };
      components: { securitySchemes: { bearerAuth: { scheme: string } } };
    };
    expect(json.openapi).toBe('3.1.0');
    expect(json.info.title).toBe('LINE OSS CRM API');
    expect(json.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });

  it('serves Swagger UI HTML when enabled', async () => {
    const { openapi } = await import('../../src/routes/openapi.js');
    const app = new Hono();
    app.route('/', openapi);

    const response = await app.fetch(new Request('http://localhost/docs'), enabledEnv as never);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('SwaggerUIBundle');
    expect(html).toContain('/openapi.json');
  });

  it('returns 404 for openapi.json when DISABLE_PUBLIC_OPENAPI is enabled', async () => {
    const { openapi } = await import('../../src/routes/openapi.js');
    const app = new Hono();
    app.route('/', openapi);

    const response = await app.fetch(new Request('http://localhost/openapi.json'), {
      DB: {} as D1Database,
      ENABLE_PUBLIC_OPENAPI: '1',
      DISABLE_PUBLIC_OPENAPI: '1',
    } as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'Not found' });
  });

  it('returns 404 for /docs when DISABLE_PUBLIC_OPENAPI is true', async () => {
    const { openapi } = await import('../../src/routes/openapi.js');
    const app = new Hono();
    app.route('/', openapi);

    const response = await app.fetch(new Request('http://localhost/docs'), {
      DB: {} as D1Database,
      ENABLE_PUBLIC_OPENAPI: '1',
      DISABLE_PUBLIC_OPENAPI: 'true',
    } as never);

    expect(response.status).toBe(404);
  });

  it.each(['yes', 'on', 'YES', ' On '])(
    'returns 404 for openapi.json when DISABLE_PUBLIC_OPENAPI is %s (case/whitespace tolerant)',
    async (flag) => {
      const { openapi } = await import('../../src/routes/openapi.js');
      const app = new Hono();
      app.route('/', openapi);

      const response = await app.fetch(new Request('http://localhost/openapi.json'), {
        DB: {} as D1Database,
        ENABLE_PUBLIC_OPENAPI: '1',
        DISABLE_PUBLIC_OPENAPI: flag,
      } as never);

      expect(response.status).toBe(404);
    },
  );

  it('rate limits rapid OpenAPI spec downloads per client IP', async () => {
    const { openapi } = await import('../../src/routes/openapi.js');
    const app = new Hono();
    app.route('/', openapi);

    let lastStatus = 200;
    for (let i = 0; i < 65; i += 1) {
      const response = await app.fetch(
        new Request('http://localhost/openapi.json', {
          headers: { 'CF-Connecting-IP': '198.51.100.55' },
        }),
        enabledEnv as never,
      );
      lastStatus = response.status;
    }

    expect(lastStatus).toBe(429);
  });
});
