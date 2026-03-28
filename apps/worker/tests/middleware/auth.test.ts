import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { authMiddleware } from '../../src/middleware/auth.js';

function createApp() {
  const app = new Hono();
  app.use('*', authMiddleware);
  app.get('/private', (c) => c.json({ success: true }));
  app.post('/api/forms/:id/submit', (c) => c.json({ success: true }));
  app.post('/api/webhooks/incoming/:id/receive', (c) => c.json({ success: true }));
  return app;
}

describe('authMiddleware', () => {
  it('rejects protected routes without a bearer token', async () => {
    const app = createApp();

    const response = await app.fetch(
      new Request('http://localhost/private'),
      { API_KEY: 'secret' } as never,
    );

    expect(response.status).toBe(401);
  });

  it('rejects the raw API_KEY as a bearer token (must use session token)', async () => {
    const app = createApp();

    const response = await app.fetch(
      new Request('http://localhost/private', {
        headers: { Authorization: 'Bearer secret' },
      }),
      { API_KEY: 'secret' } as never,
    );

    expect(response.status).toBe(401);
  });

  it('allows protected routes with a valid admin session token via Bearer header', async () => {
    const { issueAdminSessionToken } = await import('../../src/services/admin-session.js');
    const now = Math.floor(Date.now() / 1000);
    const token = await issueAdminSessionToken('secret', {
      issuedAt: now,
      expiresInSeconds: 3600,
    });
    const app = createApp();

    const response = await app.fetch(
      new Request('http://localhost/private', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { API_KEY: 'secret' } as never,
    );

    expect(response.status).toBe(200);
  });

  it('allows protected routes with a valid admin session cookie', async () => {
    const { issueAdminSessionToken } = await import('../../src/services/admin-session.js');
    const now = Math.floor(Date.now() / 1000);
    const token = await issueAdminSessionToken('secret', {
      issuedAt: now,
      expiresInSeconds: 3600,
    });
    const app = createApp();

    const response = await app.fetch(
      new Request('http://localhost/private', {
        headers: { Cookie: `lh_admin_session=${token}` },
      }),
      { API_KEY: 'secret' } as never,
    );

    expect(response.status).toBe(200);
  });

  it('skips auth on public form submit and incoming webhook endpoints', async () => {
    const app = createApp();

    const [formResponse, webhookResponse] = await Promise.all([
      app.fetch(
        new Request('http://localhost/api/forms/form-1/submit', { method: 'POST' }),
        { API_KEY: 'secret' } as never,
      ),
      app.fetch(
        new Request('http://localhost/api/webhooks/incoming/incoming-1/receive', { method: 'POST' }),
        { API_KEY: 'secret' } as never,
      ),
    ]);

    expect(formResponse.status).toBe(200);
    expect(webhookResponse.status).toBe(200);
  });
});
