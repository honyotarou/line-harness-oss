import type { LineLoginChannelId, LineLoginSub } from './types.js';

/**
 * Trust boundary after LINE verify API: nominal brands only (runtime value is still `string`).
 * Keeps `sub` distinct from other string IDs at compile time (structural typing pitfall guard).
 */
export function verifiedLineLoginSub(sub: string): LineLoginSub {
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new TypeError('LINE login sub must be a non-empty string');
  }
  return sub as LineLoginSub;
}

export function verifiedLineLoginChannelId(channelId: string): LineLoginChannelId {
  if (typeof channelId !== 'string' || channelId.length === 0) {
    throw new TypeError('LINE login channel id must be a non-empty string');
  }
  return channelId as LineLoginChannelId;
}
