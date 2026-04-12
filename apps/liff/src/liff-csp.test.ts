import { describe, expect, it } from 'vitest';
import { buildLiffContentSecurityPolicy } from './liff-csp.js';

describe('buildLiffContentSecurityPolicy', () => {
  it('allows LIFF SDK manifest fetch (liffsdk.line-scdn.net) in connect-src', () => {
    const csp = buildLiffContentSecurityPolicy('https://line-crm-worker.example.workers.dev');
    expect(csp).toContain('connect-src');
    expect(csp).toContain('https://liffsdk.line-scdn.net');
    expect(csp).toContain('https://api.line.me');
    expect(csp).toContain('https://line-crm-worker.example.workers.dev');
  });

  it('includes liffsdk host even when API base is not a fixed origin', () => {
    const csp = buildLiffContentSecurityPolicy('');
    expect(csp).toContain('https://liffsdk.line-scdn.net');
    expect(csp).toContain('https://api.line.me');
  });
});
