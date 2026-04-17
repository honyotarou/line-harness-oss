import { describe, expect, it } from 'vitest';
import {
  allowLegacyApiKeyBearerSession,
  includeSessionTokenInLoginBody,
} from '../../src/services/auth-route-helpers.js';

describe('includeSessionTokenInLoginBody', () => {
  it('is false when unset', () => {
    expect(includeSessionTokenInLoginBody({})).toBe(false);
  });

  it.each(['1', ' true ', 'YES', 'On'])('is true for truthy %j', (raw) => {
    expect(includeSessionTokenInLoginBody({ INCLUDE_SESSION_TOKEN_IN_LOGIN_BODY: raw })).toBe(true);
  });

  it.each(['0', 'false', '', 'no'])('is false for non-truthy %j', (raw) => {
    expect(includeSessionTokenInLoginBody({ INCLUDE_SESSION_TOKEN_IN_LOGIN_BODY: raw })).toBe(
      false,
    );
  });
});

describe('allowLegacyApiKeyBearerSession (sanity)', () => {
  it('is false on strict https surface', () => {
    expect(
      allowLegacyApiKeyBearerSession({
        WORKER_URL: 'https://api.example.com',
        ALLOW_LEGACY_API_KEY_BEARER_SESSION: '1',
      }),
    ).toBe(false);
  });
});
