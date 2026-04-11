import { describe, expect, it } from 'vitest';

describe('request body helpers', () => {
  it('parses json bodies within the byte limit', async () => {
    const { readJsonBodyWithLimit } = await import('../../src/services/request-body.js');

    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'root-api-key' }),
    });

    await expect(readJsonBodyWithLimit<{ apiKey: string }>(request, 1024)).resolves.toEqual({
      apiKey: 'root-api-key',
    });
  });

  it('rejects bodies larger than the configured limit', async () => {
    const { BodyTooLargeError, readTextBodyWithLimit } = await import(
      '../../src/services/request-body.js'
    );

    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '2048',
      },
      body: 'x'.repeat(2048),
    });

    await expect(readTextBodyWithLimit(request, 1024)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('jsonBodyReadErrorResponse maps BodyTooLargeError to 413 shape', async () => {
    const { BodyTooLargeError, jsonBodyReadErrorResponse } = await import(
      '../../src/services/request-body.js'
    );
    expect(jsonBodyReadErrorResponse(new BodyTooLargeError(100))).toEqual({
      status: 413,
      body: { success: false, error: 'Request body too large' },
    });
  });

  it('jsonBodyReadErrorResponse maps InvalidJsonBodyError to 400 shape', async () => {
    const { InvalidJsonBodyError, jsonBodyReadErrorResponse } = await import(
      '../../src/services/request-body.js'
    );
    expect(jsonBodyReadErrorResponse(new InvalidJsonBodyError())).toEqual({
      status: 400,
      body: { success: false, error: 'Invalid JSON body' },
    });
  });

  it('jsonBodyReadErrorResponse returns null for unrelated errors', async () => {
    const { jsonBodyReadErrorResponse } = await import('../../src/services/request-body.js');
    expect(jsonBodyReadErrorResponse(new Error('other'))).toBeNull();
  });

  it('exports default admin JSON body limit constant', async () => {
    const { DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES } = await import(
      '../../src/services/request-body.js'
    );
    expect(DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES).toBe(256 * 1024);
  });

  it('exports rich menu image JSON body limit constant', async () => {
    const { RICH_MENU_IMAGE_JSON_BODY_LIMIT_BYTES } = await import(
      '../../src/services/request-body.js'
    );
    expect(RICH_MENU_IMAGE_JSON_BODY_LIMIT_BYTES).toBe(2 * 1024 * 1024);
  });
});
