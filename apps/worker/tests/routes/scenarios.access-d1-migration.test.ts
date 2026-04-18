import type { D1Database } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestCorrelationMiddleware } from '../../src/middleware/request-correlation.js';

const listPrincipal = vi.fn();

vi.mock('@line-crm/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@line-crm/db')>();
  return {
    ...actual,
    listPrincipalLineAccountIdsForEmail: listPrincipal,
  };
});

vi.mock('../../src/services/cloudflare-access-principal.js', () => ({
  isCloudflareAccessEnforced: (): boolean => true,
  getCloudflareAccessEmailFromContext: (): string => 'admin@example.com',
  CLOUDFLARE_ACCESS_EMAIL_CLAIM_ERROR: 'x',
  CLOUDFLARE_ACCESS_EMAIL_REQUIRED_ERROR: 'y',
  getValidatedAccessEmailFromPayload: vi.fn(),
  CF_ACCESS_JWT_HEADER: 'cf-access-jwt-assertion',
}));

describe('GET /api/scenarios when admin_principal_line_accounts table is missing on D1', () => {
  beforeEach(() => {
    listPrincipal.mockReset();
  });

  it('returns 503 with code and requestId instead of opaque 500', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    listPrincipal.mockRejectedValue(
      new Error('D1_ERROR: no such table: admin_principal_line_accounts: SQLITE_ERROR'),
    );

    const { scenarios } = await import('../../src/routes/scenarios.js');
    const app = new Hono();
    app.use('*', requestCorrelationMiddleware);
    app.route('/', scenarios);

    const response = await app.fetch(
      new Request('http://localhost/api/scenarios', { headers: { 'CF-Ray': 'ray-missing-table' } }),
      {
        DB: {} as D1Database,
        API_KEY: 'test-key',
        REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      } as never,
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      success: boolean;
      code: string;
      requestId: string;
      error: string;
    };
    expect(body.success).toBe(false);
    expect(body.code).toBe('ADMIN_PRINCIPAL_LINE_ACCOUNTS_SCHEMA');
    expect(body.requestId).toBe('ray-missing-table');
    expect(body.error).toMatch(/admin_principal_line_accounts/);
    expect(response.headers.get('X-Request-Correlation-Id')).toBe('ray-missing-table');
    log.mockRestore();
  });
});
