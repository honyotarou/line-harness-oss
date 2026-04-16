import { describe, expect, it } from 'vitest';
import { isCloudflareAccessApplicationLoginRedirect } from '@line-crm/shared';

describe('isCloudflareAccessApplicationLoginRedirect', () => {
  const upstreamBase = 'https://line-crm-api.example.workers.dev';

  it('matches absolute Access login URL (team subdomain)', () => {
    expect(
      isCloudflareAccessApplicationLoginRedirect(
        'https://honyonn.cloudflareaccess.com/cdn-cgi/access/login/familybondnet.tokyo?kid=x',
        upstreamBase,
      ),
    ).toBe(true);
  });

  it('matches relative Location resolved against upstream', () => {
    expect(
      isCloudflareAccessApplicationLoginRedirect(
        '/cdn-cgi/access/login/familybondnet.tokyo',
        upstreamBase,
      ),
    ).toBe(true);
  });

  it('rejects unrelated redirects', () => {
    expect(isCloudflareAccessApplicationLoginRedirect('/oauth/callback', upstreamBase)).toBe(false);
    expect(
      isCloudflareAccessApplicationLoginRedirect('https://example.com/login', upstreamBase),
    ).toBe(false);
  });

  it('rejects empty Location', () => {
    expect(isCloudflareAccessApplicationLoginRedirect('', upstreamBase)).toBe(false);
    expect(isCloudflareAccessApplicationLoginRedirect(undefined, upstreamBase)).toBe(false);
  });
});
