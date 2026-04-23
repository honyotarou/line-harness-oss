import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listAdminAuditLogs = vi.fn();
const listPrincipalLineAccountIdsForEmail = vi.fn();

vi.mock('@line-crm/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@line-crm/db')>();
  return {
    ...actual,
    listAdminAuditLogs,
    listPrincipalLineAccountIdsForEmail,
  };
});

describe('GET /api/admin/audit-log', () => {
  beforeEach(() => {
    listAdminAuditLogs.mockReset();
    listPrincipalLineAccountIdsForEmail.mockReset();
  });

  it('returns sanitized rows newest-first', async () => {
    listAdminAuditLogs.mockResolvedValue([
      {
        id: 'a1',
        created_at: '2026-04-15T12:00:00+09:00',
        action: 'broadcast.send',
        actor_email: 'admin@example.com',
        actor_kind: 'cloudflare_access',
        resource_type: 'broadcast',
        resource_id: 'b1',
        metadata: '{"title":"<x>"}',
        request_path: '/api/broadcasts/b1/send',
        ip_hash: 'abc123',
      },
    ]);

    const { adminAudit } = await import('../../src/routes/admin-audit.js');
    const app = new Hono();
    app.route('/', adminAudit);

    const res = await app.fetch(new Request('http://localhost/api/admin/audit-log?limit=10'), {
      DB: {} as D1Database,
    } as never);

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: Array<{ metadata: Record<string, string> }>;
    };
    expect(json.success).toBe(true);
    expect(json.data[0].metadata.title).toBe('&lt;x&gt;');
    expect(listAdminAuditLogs).toHaveBeenCalledWith(expect.anything(), { limit: 10, offset: 0 });
  });

  it('returns 403 for a restricted-scope principal (audit log is owner-only) — F5b', async () => {
    listPrincipalLineAccountIdsForEmail.mockResolvedValue(['acc-A']);

    const { adminAudit } = await import('../../src/routes/admin-audit.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', adminAudit);

    const res = await app.fetch(new Request('http://localhost/api/admin/audit-log?limit=50'), {
      DB: {} as D1Database,
      API_KEY: 'k',
      REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
    } as never);

    expect(res.status).toBe(403);
    expect(listAdminAuditLogs).not.toHaveBeenCalled();
  });
});
