import { describe, expect, it } from 'vitest';
import { shouldBypassCloudflareAccessJwtForCorsPreflight } from '../../src/services/cloudflare-access-preflight-policy.js';

describe('shouldBypassCloudflareAccessJwtForCorsPreflight (Access + CORS contract)', () => {
  it('returns true only for OPTIONS (preflight never sends Access cookies / assertion)', () => {
    expect(shouldBypassCloudflareAccessJwtForCorsPreflight('OPTIONS')).toBe(true);
    expect(shouldBypassCloudflareAccessJwtForCorsPreflight('options')).toBe(true);
  });

  it('returns false for real HTTP methods so GET/POST still require Cf JWT when enforced', () => {
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
      expect(shouldBypassCloudflareAccessJwtForCorsPreflight(m)).toBe(false);
    }
  });
});
