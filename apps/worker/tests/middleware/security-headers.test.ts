import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { securityHeadersMiddleware } from '../../src/middleware/security-headers.js';

describe('securityHeadersMiddleware', () => {
  it('adds X-Content-Type-Options on all responses', async () => {
    const app = new Hono();
    app.use('*', securityHeadersMiddleware);
    app.get('/x', (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request('http://localhost/x'));
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('adds Cache-Control no-store for /api/* paths', async () => {
    const app = new Hono();
    app.use('*', securityHeadersMiddleware);
    app.get('/api/ping', (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request('http://localhost/api/ping'));
    expect(res.headers.get('Cache-Control')).toBe('no-store, private');
  });

  it('does not force no-store on non-API paths', async () => {
    const app = new Hono();
    app.use('*', securityHeadersMiddleware);
    app.get('/r/foo', (c) => c.html('<p>x</p>'));

    const res = await app.fetch(new Request('http://localhost/r/foo'));
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toBeNull();
  });

  it('adds HSTS on HTTPS requests', async () => {
    const app = new Hono();
    app.use('*', securityHeadersMiddleware);
    app.get('/api/ping', (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request('https://worker.example/api/ping'));
    expect(res.headers.get('Strict-Transport-Security')).toMatch(/max-age=31536000/);
  });

  it('omits HSTS on plain HTTP (local dev)', async () => {
    const app = new Hono();
    app.use('*', securityHeadersMiddleware);
    app.get('/api/ping', (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request('http://localhost/api/ping'));
    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('adds X-Frame-Options DENY and a minimal Permissions-Policy', async () => {
    const app = new Hono();
    app.use('*', securityHeadersMiddleware);
    app.get('/x', (c) => c.text('ok'));

    const res = await app.fetch(new Request('http://localhost/x'));
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()');
  });
});
