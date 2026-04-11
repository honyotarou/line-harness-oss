import { describe, expect, it } from 'vitest';
import { sanitizeLineProfilePictureUrlForHtml } from '../../src/services/safe-line-picture-url.js';

describe('sanitizeLineProfilePictureUrlForHtml', () => {
  it('accepts https profile.line-scdn.net URLs', () => {
    expect(sanitizeLineProfilePictureUrlForHtml('https://profile.line-scdn.net/abc123/def')).toBe(
      'https://profile.line-scdn.net/abc123/def',
    );
  });

  it('accepts other *.line-scdn.net hosts', () => {
    expect(sanitizeLineProfilePictureUrlForHtml('https://obs.line-scdn.net/x')).toBe(
      'https://obs.line-scdn.net/x',
    );
  });

  it('rejects javascript: and non-https schemes', () => {
    expect(sanitizeLineProfilePictureUrlForHtml('javascript:alert(1)')).toBeNull();
    expect(sanitizeLineProfilePictureUrlForHtml('data:text/html,<svg/onload=1>')).toBeNull();
    expect(sanitizeLineProfilePictureUrlForHtml('http://profile.line-scdn.net/x')).toBeNull();
  });

  it('rejects arbitrary https origins', () => {
    expect(sanitizeLineProfilePictureUrlForHtml('https://evil.example/a.png')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(sanitizeLineProfilePictureUrlForHtml(null)).toBeNull();
    expect(sanitizeLineProfilePictureUrlForHtml('')).toBeNull();
    expect(sanitizeLineProfilePictureUrlForHtml('   ')).toBeNull();
  });
});
