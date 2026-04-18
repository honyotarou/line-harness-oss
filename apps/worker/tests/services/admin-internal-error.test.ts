import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/index.js';
import {
  getRequestCorrelationId,
  jsonInternalServerError,
} from '../../src/services/admin-internal-error.js';
import { requestCorrelationMiddleware } from '../../src/middleware/request-correlation.js';

describe('admin-internal-error', () => {
  it('getRequestCorrelationId prefers CF-Ray when middleware did not run', async () => {
    const app = new Hono<Env>();
    app.get('/t', (c) => c.json({ id: getRequestCorrelationId(c) }));
    const res = await app.fetch(
      new Request('http://localhost/t', { headers: { 'CF-Ray': 'ray-abc' } }),
    );
    expect(((await res.json()) as { id: string }).id).toBe('ray-abc');
  });

  it('jsonInternalServerError includes requestId and X-Request-Correlation-Id header', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = new Hono<Env>();
    app.use('*', requestCorrelationMiddleware);
    app.get('/boom', (c) => jsonInternalServerError(c, 'test-label', new Error('x')));
    const res = await app.fetch(
      new Request('http://localhost/boom', { headers: { 'CF-Ray': 'edge-123' } }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { requestId: string; error: string; success: boolean };
    expect(body.success).toBe(false);
    expect(body.error).toBe('Internal server error');
    expect(body.requestId).toBe('edge-123');
    expect(res.headers.get('X-Request-Correlation-Id')).toBe('edge-123');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
