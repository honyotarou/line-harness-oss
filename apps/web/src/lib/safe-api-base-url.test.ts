import { describe, expect, it } from 'vitest';
import { validateClientApiBaseUrl } from '@line-crm/shared';

describe('validateClientApiBaseUrl', () => {
  it('accepts https origins and normalizes the origin string', () => {
    const r = validateClientApiBaseUrl('https://API.EXAMPLE.COM///', {
      allowPlaceholderTemplate: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalizedOrigin).toBe('https://api.example.com');
  });

  it('accepts http only for loopback hosts', () => {
    expect(
      validateClientApiBaseUrl('http://127.0.0.1:8787/', { allowPlaceholderTemplate: true }).ok,
    ).toBe(true);
    expect(
      validateClientApiBaseUrl('http://evil.test/', { allowPlaceholderTemplate: true }).ok,
    ).toBe(false);
  });

  it('rejects credentials, query, fragment, and non-root paths', () => {
    expect(
      validateClientApiBaseUrl('https://u:p@h.com/', { allowPlaceholderTemplate: true }).ok,
    ).toBe(false);
    expect(
      validateClientApiBaseUrl('https://h.com?x=1', { allowPlaceholderTemplate: true }).ok,
    ).toBe(false);
    expect(validateClientApiBaseUrl('https://h.com#x', { allowPlaceholderTemplate: true }).ok).toBe(
      false,
    );
    expect(
      validateClientApiBaseUrl('https://h.com/api', { allowPlaceholderTemplate: true }).ok,
    ).toBe(false);
  });

  it('rejects the template workers.dev host when placeholder is disallowed', () => {
    const ok = validateClientApiBaseUrl('https://your_subdomain.workers.dev', {
      allowPlaceholderTemplate: true,
    });
    expect(ok.ok).toBe(true);

    const bad = validateClientApiBaseUrl('https://your_subdomain.workers.dev', {
      allowPlaceholderTemplate: false,
    });
    expect(bad.ok).toBe(false);
  });
});
