import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { hostHeaderMiddleware } from '../../src/middleware/host-header.js';

describe('hostHeaderMiddleware', () => {
  it('allows any Host when ALLOWED_HOSTNAMES is unset', async () => {
    const app = new Hono();
    app.use('*', hostHeaderMiddleware);
    app.get('/x', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://evil.local/x', { headers: { Host: 'evil.local' } }),
      {
        DB: {} as D1Database,
      } as never,
    );

    expect(res.status).toBe(200);
  });

  it('returns 403 when Host is not in the allowlist', async () => {
    const app = new Hono();
    app.use('*', hostHeaderMiddleware);
    app.get('/x', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://wrong-host/x', { headers: { Host: 'wrong-host' } }),
      {
        DB: {} as D1Database,
        ALLOWED_HOSTNAMES: 'api.example.com,127.0.0.1',
      } as never,
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid Host header');
  });

  it('allows Host that matches allowlist (ignoring port)', async () => {
    const app = new Hono();
    app.use('*', hostHeaderMiddleware);
    app.get('/x', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://api.example.com:9999/x', { headers: { Host: 'api.example.com:9999' } }),
      {
        DB: {} as D1Database,
        ALLOWED_HOSTNAMES: 'api.example.com',
      } as never,
    );

    expect(res.status).toBe(200);
  });
});
