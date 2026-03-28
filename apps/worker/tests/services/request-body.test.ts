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
});
