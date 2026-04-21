import { describe, it, expect, vi } from 'vitest';
import { createTrafficPoolsResource } from '../../src/resources/traffic-pools.js';
import type { HttpClient } from '../../src/http.js';

function mockHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

describe('TrafficPoolsResource', () => {
  it('list() calls GET /api/traffic-pools', async () => {
    const pools = [
      {
        id: 'tp-1',
        slug: 'a',
        name: 'A',
        activeAccountId: 'la-1',
        accountName: 'Acc',
        liffId: null,
        isActive: true,
        createdAt: 't',
        updatedAt: 't',
      },
    ];
    const http = mockHttp({ get: vi.fn().mockResolvedValue({ success: true, data: pools }) });
    const r = createTrafficPoolsResource(http);
    await expect(r.list()).resolves.toEqual(pools);
    expect(http.get).toHaveBeenCalledWith('/api/traffic-pools');
  });

  it('create() posts body', async () => {
    const created = {
      id: 'tp-new',
      slug: 's',
      name: 'N',
      activeAccountId: 'la',
      accountName: 'Acc',
      liffId: null,
      isActive: true,
      createdAt: 't',
      updatedAt: 't',
    };
    const http = mockHttp({ post: vi.fn().mockResolvedValue({ success: true, data: created }) });
    const r = createTrafficPoolsResource(http);
    await expect(r.create({ slug: 's', name: 'N', activeAccountId: 'la' })).resolves.toEqual(
      created,
    );
    expect(http.post).toHaveBeenCalledWith('/api/traffic-pools', {
      slug: 's',
      name: 'N',
      activeAccountId: 'la',
    });
  });
});
