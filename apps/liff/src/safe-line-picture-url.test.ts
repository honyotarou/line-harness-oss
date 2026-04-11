import { describe, expect, it } from 'vitest';
import { sanitizeLineProfilePictureUrlForHtml } from './safe-line-picture-url.js';

describe('sanitizeLineProfilePictureUrlForHtml', () => {
  it('allows LINE CDN and blocks javascript:', () => {
    expect(sanitizeLineProfilePictureUrlForHtml('https://profile.line-scdn.net/x')).toContain(
      'profile.line-scdn.net',
    );
    expect(sanitizeLineProfilePictureUrlForHtml('javascript:void(0)')).toBeNull();
  });
});
