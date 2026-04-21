import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchHttpsMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/services/outbound-https-fetch.js', () => ({
  fetchHttpsUrlAfterDnsAssertion: fetchHttpsMock,
}));

describe('syncAdPlatformConnection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when credentials_enc is empty', async () => {
    const { syncAdPlatformConnection } = await import(
      '../../src/services/ad-platform-outbound-sync.js'
    );
    const r = await syncAdPlatformConnection({
      id: '1',
      provider: 'meta',
      name: 'x',
      line_account_id: null,
      external_account_ref: null,
      credentials_enc: null,
      metadata_json: '{}',
      is_active: 1,
      created_at: 't',
      updated_at: 't',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Missing credentials_enc/);
    expect(fetchHttpsMock).not.toHaveBeenCalled();
  });

  it('returns error when JSON lacks accessToken', async () => {
    const { syncAdPlatformConnection } = await import(
      '../../src/services/ad-platform-outbound-sync.js'
    );
    const r = await syncAdPlatformConnection({
      id: '1',
      provider: 'google',
      name: 'x',
      line_account_id: null,
      external_account_ref: null,
      credentials_enc: JSON.stringify({ foo: 1 }),
      metadata_json: '{}',
      is_active: 1,
      created_at: 't',
      updated_at: 't',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/accessToken/);
  });

  it('calls Meta Graph when credentials are valid JSON', async () => {
    fetchHttpsMock.mockResolvedValue({
      ok: true,
      response: new Response(JSON.stringify({ id: 'fb1', name: 'Test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    });
    const { syncAdPlatformConnection } = await import(
      '../../src/services/ad-platform-outbound-sync.js'
    );
    const r = await syncAdPlatformConnection({
      id: '1',
      provider: 'meta',
      name: 'x',
      line_account_id: null,
      external_account_ref: null,
      credentials_enc: JSON.stringify({ accessToken: 'tok' }),
      metadata_json: '{}',
      is_active: 1,
      created_at: 't',
      updated_at: 't',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.summary.graphUserId).toBe('fb1');
      expect(r.summary.graphName).toBe('Test');
    }
    expect(fetchHttpsMock).toHaveBeenCalledTimes(1);
    const arg0 = fetchHttpsMock.mock.calls[0]?.[0] as string;
    expect(arg0).toContain('graph.facebook.com');
  });

  it('requires advertiser id for TikTok', async () => {
    const { syncAdPlatformConnection } = await import(
      '../../src/services/ad-platform-outbound-sync.js'
    );
    const r = await syncAdPlatformConnection({
      id: '1',
      provider: 'tiktok',
      name: 'x',
      line_account_id: null,
      external_account_ref: null,
      credentials_enc: JSON.stringify({ accessToken: 'tok' }),
      metadata_json: '{}',
      is_active: 1,
      created_at: 't',
      updated_at: 't',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/advertiser/);
  });

  it('maps upstream HTTP errors for Meta', async () => {
    fetchHttpsMock.mockResolvedValue({
      ok: true,
      response: new Response(JSON.stringify({ error: { message: 'Invalid OAuth' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    });
    const { syncAdPlatformConnection } = await import(
      '../../src/services/ad-platform-outbound-sync.js'
    );
    const r = await syncAdPlatformConnection({
      id: '1',
      provider: 'meta',
      name: 'x',
      line_account_id: null,
      external_account_ref: null,
      credentials_enc: JSON.stringify({ accessToken: 'bad' }),
      metadata_json: '{}',
      is_active: 1,
      created_at: 't',
      updated_at: 't',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.upstreamStatus).toBe(401);
      expect(r.error).toContain('Invalid OAuth');
    }
  });
});
