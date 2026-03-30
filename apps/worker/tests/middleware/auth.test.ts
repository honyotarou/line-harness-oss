import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { authMiddleware } from '../../src/middleware/auth.js';

function createApp() {
  const app = new Hono();
  app.use('*', authMiddleware);
  app.get('/private', (c) => c.json({ success: true }));
  app.post('/private', (c) => c.json({ success: true }));
  app.get('/api/forms/:id', (c) => c.json({ success: true }));
  app.put('/api/forms/:id', (c) => c.json({ success: true }));
  app.delete('/api/forms/:id', (c) => c.json({ success: true }));
  app.post('/api/forms/:id/submit', (c) => c.json({ success: true }));
  app.post('/api/webhooks/incoming/:id/receive', (c) => c.json({ success: true }));
  return app;
}

describe('authMiddleware', () => {
  it('rejects protected routes without a bearer token', async () => {
    const app = createApp();

    const response = await app.fetch(new Request('http://localhost/private'), {
      API_KEY: 'secret',
    } as never);

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

  it('rejects cross-site unsafe requests when authenticated by admin session cookie', async () => {
    const { issueAdminSessionToken } = await import('../../src/services/admin-session.js');
    const now = Math.floor(Date.now() / 1000);
    const token = await issueAdminSessionToken('secret', {
      issuedAt: now,
      expiresInSeconds: 3600,
    });
    const app = createApp();

    const response = await app.fetch(
      new Request('http://localhost/private', {
        method: 'POST',
        headers: {
          Cookie: `lh_admin_session=${token}`,
          Origin: 'https://attacker.example',
        },
      }),
      {
        API_KEY: 'secret',
        WORKER_URL: 'https://api.example',
        WEB_URL: 'https://admin.example',
        LIFF_URL: 'https://liff.line.me/12345',
      } as never,
    );

    expect(response.status).toBe(403);
  });

  it('allows unsafe requests when authenticated via Bearer header (not cookie)', async () => {
    const { issueAdminSessionToken } = await import('../../src/services/admin-session.js');
    const now = Math.floor(Date.now() / 1000);
    const token = await issueAdminSessionToken('secret', {
      issuedAt: now,
      expiresInSeconds: 3600,
    });
    const app = createApp();

    const response = await app.fetch(
      new Request('http://localhost/private', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: 'https://attacker.example',
        },
      }),
      {
        API_KEY: 'secret',
        WORKER_URL: 'https://api.example',
        WEB_URL: 'https://admin.example',
        LIFF_URL: 'https://liff.line.me/12345',
      } as never,
    );

    expect(response.status).toBe(200);
  });

  it('skips auth on public form submit and incoming webhook endpoints', async () => {
    const app = createApp();

    const [formResponse, webhookResponse] = await Promise.all([
      app.fetch(new Request('http://localhost/api/forms/form-1/submit', { method: 'POST' }), {
        API_KEY: 'secret',
      } as never),
      app.fetch(
        new Request('http://localhost/api/webhooks/incoming/incoming-1/receive', {
          method: 'POST',
        }),
        { API_KEY: 'secret' } as never,
      ),
    ]);

    expect(formResponse.status).toBe(200);
    expect(webhookResponse.status).toBe(200);
  });

  it('skips auth only for GET form definition, not PUT or DELETE', async () => {
    const app = createApp();

    const [getRes, putRes, delRes] = await Promise.all([
      app.fetch(new Request('http://localhost/api/forms/form-1', { method: 'GET' }), {
        API_KEY: 'secret',
      } as never),
      app.fetch(new Request('http://localhost/api/forms/form-1', { method: 'PUT' }), {
        API_KEY: 'secret',
      } as never),
      app.fetch(new Request('http://localhost/api/forms/form-1', { method: 'DELETE' }), {
        API_KEY: 'secret',
      } as never),
    ]);

    expect(getRes.status).toBe(200);
    expect(putRes.status).toBe(401);
    expect(delRes.status).toBe(401);
  });
});
