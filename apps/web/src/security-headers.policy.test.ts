import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAdminContentSecurityPolicy } from './security/csp-policy';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('security headers for static admin (Vercel)', () => {
  it('vercel.json CSP matches production policy helper (no drift)', () => {
    const raw = readFileSync(join(webRoot, 'vercel.json'), 'utf8');
    const j = JSON.parse(raw) as {
      headers: Array<{ headers: Array<{ key: string; value: string }> }>;
    };
    const list = j.headers[0]?.headers ?? [];
    const csp = list.find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
    expect(csp).toBe(buildAdminContentSecurityPolicy({ allowUnsafeEval: false }));
    expect(list.find((h) => h.key === 'X-Content-Type-Options')?.value).toBe('nosniff');
    expect(list.find((h) => h.key === 'Strict-Transport-Security')?.value).toMatch(/max-age=/);
    expect(list.find((h) => h.key === 'X-Frame-Options')?.value).toBe('DENY');
  });

  it('dev policy allows unsafe-eval for Next.js tooling', () => {
    const dev = buildAdminContentSecurityPolicy({ allowUnsafeEval: true });
    expect(dev).toContain("'unsafe-eval'");
    const prod = buildAdminContentSecurityPolicy({ allowUnsafeEval: false });
    expect(prod).not.toContain("'unsafe-eval'");
  });

  it('production img-src scopes to LINE CDN instead of all https origins', () => {
    const prod = buildAdminContentSecurityPolicy({ allowUnsafeEval: false });
    expect(prod).toMatch(/img-src 'self' data: blob: https:\/\/\*\.line-scdn\.net/);
  });

  it('locks down workers and media without breaking static-export script policy', () => {
    const prod = buildAdminContentSecurityPolicy({ allowUnsafeEval: false });
    expect(prod).toContain("worker-src 'none'");
    expect(prod).toContain("media-src 'self'");
    expect(prod).toContain("script-src 'self' 'unsafe-inline'");
  });

  it('narrows connect-src when NEXT_PUBLIC_API_URL is a valid non-placeholder https origin', () => {
    const csp = buildAdminContentSecurityPolicy({
      allowUnsafeEval: false,
      narrowConnectSrcFromApiUrl: 'https://crm-api.example.com',
    });
    expect(csp).toMatch(/connect-src 'self' https:\/\/crm-api\.example\.com/);
    expect(csp).not.toMatch(/connect-src 'self' https:;/);
  });

  it('keeps broad connect-src when API URL is the repo placeholder or invalid', () => {
    const ph = buildAdminContentSecurityPolicy({
      allowUnsafeEval: false,
      narrowConnectSrcFromApiUrl: 'https://your_subdomain.workers.dev',
    });
    expect(ph).toContain("connect-src 'self' https:");

    const bad = buildAdminContentSecurityPolicy({
      allowUnsafeEval: false,
      narrowConnectSrcFromApiUrl: 'not-a-url',
    });
    expect(bad).toContain("connect-src 'self' https:");
  });
});
