import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

describe('openapi routes', () => {
  it('serves the OpenAPI spec as JSON', async () => {
    const { openapi } = await import('../../src/routes/openapi.js');
    const app = new Hono();
    app.route('/', openapi);

    const response = await app.fetch(new Request('http://localhost/openapi.json'));

    expect(response.status).toBe(200);
    const json = await response.json() as {
      openapi: string;
      info: { title: string };
      components: { securitySchemes: { bearerAuth: { scheme: string } } };
    };
    expect(json.openapi).toBe('3.1.0');
    expect(json.info.title).toBe('LINE OSS CRM API');
    expect(json.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });

  it('serves Swagger UI HTML', async () => {
    const { openapi } = await import('../../src/routes/openapi.js');
    const app = new Hono();
    app.route('/', openapi);

    const response = await app.fetch(new Request('http://localhost/docs'));

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('SwaggerUIBundle');
    expect(html).toContain('/openapi.json');
  });
});
