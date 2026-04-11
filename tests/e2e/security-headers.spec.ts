import { expect, test } from '@playwright/test';

test.describe('admin UI security headers', () => {
  test('login page responds with CSP, nosniff, and referrer policy', async ({ request }) => {
    const res = await request.get('/login');
    expect(res.ok()).toBe(true);

    const csp = res.headers()['content-security-policy'];
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");

    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });
});
