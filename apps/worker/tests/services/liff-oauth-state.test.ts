import { describe, expect, it } from 'vitest';
import { signLiffOAuthState, verifyLiffOAuthState } from '../../src/services/liff-oauth-state.js';

const secret = 'unit-test-secret';

describe('liff-oauth-state', () => {
  it('round-trips and restores fields', async () => {
    const token = await signLiffOAuthState(
      {
        ref: 'r1',
        redirect: 'https://a.example/x',
        gclid: '',
        fbclid: '',
        utmSource: '',
        utmMedium: '',
        utmCampaign: '',
        utmContent: '',
        utmTerm: '',
        account: '',
        uid: 'u1',
      },
      secret,
    );
    const out = await verifyLiffOAuthState(token, secret);
    expect(out).toEqual(
      expect.objectContaining({
        ref: 'r1',
        redirect: 'https://a.example/x',
        uid: 'u1',
      }),
    );
  });

  it('rejects wrong secret', async () => {
    const token = await signLiffOAuthState(
      {
        ref: '',
        redirect: '',
        gclid: '',
        fbclid: '',
        utmSource: '',
        utmMedium: '',
        utmCampaign: '',
        utmContent: '',
        utmTerm: '',
        account: '',
        uid: '',
      },
      secret,
    );
    expect(await verifyLiffOAuthState(token, 'other')).toBeNull();
  });

  it('rejects truncated token', async () => {
    expect(await verifyLiffOAuthState('nodot', secret)).toBeNull();
  });
});
