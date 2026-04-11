import { describe, expect, it } from 'vitest';

describe('api write Content-Type policy', () => {
  it('isJsonFamilyContentType accepts application/json with charset', async () => {
    const { isJsonFamilyContentType } = await import(
      '../../src/services/api-write-content-type.js'
    );
    expect(isJsonFamilyContentType('application/json; charset=utf-8')).toBe(true);
  });

  it('isJsonFamilyContentType accepts application/vnd.api+json', async () => {
    const { isJsonFamilyContentType } = await import(
      '../../src/services/api-write-content-type.js'
    );
    expect(isJsonFamilyContentType('application/vnd.api+json')).toBe(true);
  });

  it('isJsonFamilyContentType rejects text/plain', async () => {
    const { isJsonFamilyContentType } = await import(
      '../../src/services/api-write-content-type.js'
    );
    expect(isJsonFamilyContentType('text/plain')).toBe(false);
  });

  it('allows incoming webhook receive with any declared type', async () => {
    const { allowsApiWriteContentType } = await import(
      '../../src/services/api-write-content-type.js'
    );
    expect(
      allowsApiWriteContentType('/api/webhooks/incoming/wh-1/receive', 'POST', 'text/plain'),
    ).toBe(true);
    expect(
      allowsApiWriteContentType(
        '/api/webhooks/incoming/wh-1/../wh-1/receive',
        'POST',
        'text/plain',
      ),
    ).toBe(true);
  });

  it('allows rich menu image POST with image/png', async () => {
    const { allowsApiWriteContentType } = await import(
      '../../src/services/api-write-content-type.js'
    );
    expect(allowsApiWriteContentType('/api/rich-menus/rm-1/image', 'POST', 'image/png')).toBe(true);
  });

  it('rejects rich menu image POST with application/octet-stream', async () => {
    const { allowsApiWriteContentType } = await import(
      '../../src/services/api-write-content-type.js'
    );
    expect(
      allowsApiWriteContentType('/api/rich-menus/rm-1/image', 'POST', 'application/octet-stream'),
    ).toBe(false);
  });
});
