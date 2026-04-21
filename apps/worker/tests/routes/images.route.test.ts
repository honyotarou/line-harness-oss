import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { resetRequestRateLimits } from '../../src/services/request-rate-limit.js';

describe('images routes', () => {
  afterEach(() => {
    resetRequestRateLimits();
  });

  it('POST /api/images returns 503 when LINE_CRM_IMAGES is not bound', async () => {
    const { images } = await import('../../src/routes/images.js');
    const app = new Hono();
    app.route('/', images);

    const res = await app.fetch(
      new Request('http://127.0.0.1/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType: 'image/png', base64: 'e30=' }),
      }),
      { DB: {} as D1Database } as never,
    );
    expect(res.status).toBe(503);
  });

  it('GET /api/images/public/:token returns 404 for invalid token shape', async () => {
    const { images } = await import('../../src/routes/images.js');
    const app = new Hono();
    app.route('/', images);

    const res = await app.fetch(new Request('http://127.0.0.1/api/images/public/not-hex'), {
      DB: {} as D1Database,
    } as never);
    expect(res.status).toBe(404);
  });
});
