import { describe, expect, it } from 'vitest';
import {
  issueTrackedLinkFriendToken,
  verifyTrackedLinkFriendToken,
} from '../../src/services/tracking-friend-token.js';

const SECRET = 'unit-test-secret';

describe('tracking-friend-token', () => {
  it('verify returns friendId when linkId matches and token is not expired', async () => {
    const token = await issueTrackedLinkFriendToken(SECRET, {
      linkId: 'link-a',
      friendId: 'friend-1',
      expiresInSeconds: 3600,
    });
    const out = await verifyTrackedLinkFriendToken(SECRET, 'link-a', token);
    expect(out).toBe('friend-1');
  });

  it('verify returns null when linkId does not match payload', async () => {
    const token = await issueTrackedLinkFriendToken(SECRET, {
      linkId: 'link-a',
      friendId: 'friend-1',
      expiresInSeconds: 3600,
    });
    const out = await verifyTrackedLinkFriendToken(SECRET, 'other-link', token);
    expect(out).toBeNull();
  });

  it('verify returns null when token is expired', async () => {
    const now = 1_700_000_000;
    const token = await issueTrackedLinkFriendToken(
      SECRET,
      {
        linkId: 'link-a',
        friendId: 'friend-1',
        expiresInSeconds: 60,
      },
      { issuedAt: now - 120 },
    );
    const out = await verifyTrackedLinkFriendToken(SECRET, 'link-a', token, { now: now });
    expect(out).toBeNull();
  });

  it('verify returns null for tampered token', async () => {
    const token = await issueTrackedLinkFriendToken(SECRET, {
      linkId: 'link-a',
      friendId: 'friend-1',
      expiresInSeconds: 3600,
    });
    const tampered = token.slice(0, -4) + 'xxxx';
    const out = await verifyTrackedLinkFriendToken(SECRET, 'link-a', tampered);
    expect(out).toBeNull();
  });

  it('verify returns null for garbage input', async () => {
    expect(await verifyTrackedLinkFriendToken(SECRET, 'link-a', 'not-a-token')).toBeNull();
    expect(await verifyTrackedLinkFriendToken(SECRET, 'link-a', '')).toBeNull();
  });
});
