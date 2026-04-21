import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHttpClient } from '../src/http.js';
import type { HttpClient } from '../src/http.js';
import { isLineHarnessError } from '../src/errors.js';

describe('HttpClient', () => {
  let http: HttpClient;

  beforeEach(() => {
    http = createHttpClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
      timeout: 5000,
    });
  });

  it('sends GET with auth header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { id: '1' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await http.get('/api/friends');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/api/friends',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
    expect(result).toEqual({ success: true, data: { id: '1' } });
    vi.unstubAllGlobals();
  });

  it('sends POST with JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { id: '1' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await http.post('/api/tags', { name: 'VIP' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/api/tags',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'VIP' }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it('throws LineHarnessError on 4xx/5xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ success: false, error: 'Not found' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(http.get('/api/scenarios/xxx')).rejects.toMatchObject({
      name: 'LineHarnessError',
      status: 404,
      message: 'Not found',
      endpoint: 'GET /api/scenarios/xxx',
    });
    await expect(http.get('/api/scenarios/xxx')).rejects.toSatisfy(isLineHarnessError);
    vi.unstubAllGlobals();
  });
});
