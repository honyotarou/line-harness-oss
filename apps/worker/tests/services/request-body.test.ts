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
    const { isBodyTooLargeError, readTextBodyWithLimit } = await import(
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

    await expect(readTextBodyWithLimit(request, 1024)).rejects.toSatisfy(isBodyTooLargeError);
  });

  it('jsonBodyReadErrorResponse maps BodyTooLargeError to 413 shape', async () => {
    const { createBodyTooLargeError, jsonBodyReadErrorResponse } = await import(
      '../../src/services/request-body.js'
    );
    expect(jsonBodyReadErrorResponse(createBodyTooLargeError(100))).toEqual({
      status: 413,
      body: { success: false, error: 'Request body too large' },
    });
  });

  it('jsonBodyReadErrorResponse maps InvalidJsonBodyError to 400 shape', async () => {
    const { createInvalidJsonBodyError, jsonBodyReadErrorResponse } = await import(
      '../../src/services/request-body.js'
    );
    expect(jsonBodyReadErrorResponse(createInvalidJsonBodyError())).toEqual({
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

  it('assertRequestContentLengthWithinLimit throws when Content-Length exceeds cap', async () => {
    const {
      assertRequestContentLengthWithinLimit,
      isBodyTooLargeError,
      RICH_MENU_IMAGE_BINARY_MAX_BYTES,
    } = await import('../../src/services/request-body.js');

    const request = new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'Content-Length': String(RICH_MENU_IMAGE_BINARY_MAX_BYTES + 1) },
    });

    try {
      assertRequestContentLengthWithinLimit(request, RICH_MENU_IMAGE_BINARY_MAX_BYTES);
      expect.fail('expected throw');
    } catch (err) {
      expect(isBodyTooLargeError(err)).toBe(true);
    }
  });

  it('assertArrayBufferWithinLimit throws when buffer exceeds cap', async () => {
    const { assertArrayBufferWithinLimit, isBodyTooLargeError } = await import(
      '../../src/services/request-body.js'
    );

    const buf = new ArrayBuffer(10);
    try {
      assertArrayBufferWithinLimit(buf, 9);
      expect.fail('expected throw');
    } catch (err) {
      expect(isBodyTooLargeError(err)).toBe(true);
    }
  });
});
