import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { apiWriteContentTypeMiddleware } from '../../src/middleware/api-write-content-type.js';

describe('apiWriteContentTypeMiddleware', () => {
  it('returns 415 for POST /api/tags with text/plain and JSON body', async () => {
    const app = new Hono();
    app.use('*', apiWriteContentTypeMiddleware);
    app.post('/api/tags', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://localhost/api/tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: JSON.stringify({ name: 'x' }),
      }),
    );

    expect(res.status).toBe(415);
    const j = (await res.json()) as { success: boolean; error: string };
    expect(j.success).toBe(false);
    expect(j.error).toContain('Content-Type');
  });

  it('allows POST /api/tags with application/json', async () => {
    const app = new Hono();
    app.use('*', apiWriteContentTypeMiddleware);
    app.post('/api/tags', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://localhost/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x' }),
      }),
    );

    expect(res.status).toBe(200);
  });

  it('passes OPTIONS without Content-Type', async () => {
    const app = new Hono();
    app.use('*', apiWriteContentTypeMiddleware);
    app.options('/api/tags', (c) => c.body(null, 204));

    const res = await app.fetch(new Request('http://localhost/api/tags', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
  });
});
