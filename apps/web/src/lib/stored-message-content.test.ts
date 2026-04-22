import { describe, expect, it } from 'vitest';
import {
  buildStoredImageMessageContent,
  isStoredFlexMessageContent,
  parseStoredImageMessageContent,
} from './stored-message-content';

describe('stored-message-content', () => {
  it('builds stored image JSON with preview fallback', () => {
    expect(
      buildStoredImageMessageContent({
        originalContentUrl: ' https://example.com/orig.png ',
      }),
    ).toBe(
      JSON.stringify({
        originalContentUrl: 'https://example.com/orig.png',
        previewImageUrl: 'https://example.com/orig.png',
      }),
    );
  });

  it('parses stored image JSON (requires both URLs)', () => {
    expect(
      parseStoredImageMessageContent(
        JSON.stringify({
          originalContentUrl: 'https://example.com/o.png',
          previewImageUrl: 'https://example.com/p.png',
        }),
      ),
    ).toEqual({
      originalContentUrl: 'https://example.com/o.png',
      previewImageUrl: 'https://example.com/p.png',
    });

    expect(parseStoredImageMessageContent('{"originalContentUrl":"x"}')).toBeNull();
    expect(parseStoredImageMessageContent('not-json')).toBeNull();
  });

  it('accepts flex JSON objects only', () => {
    expect(isStoredFlexMessageContent('{"type":"bubble"}')).toBe(true);
    expect(isStoredFlexMessageContent('[]')).toBe(false);
    expect(isStoredFlexMessageContent('not-json')).toBe(false);
  });
});
