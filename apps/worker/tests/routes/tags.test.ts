import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getTags: vi.fn(),
  createTag: vi.fn(),
  deleteTag: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

describe('tag routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('lists tags with serialized fields', async () => {
    dbMocks.getTags.mockResolvedValue([
      {
        id: 'tag-1',
        name: 'VIP',
        color: '#ff0000',
        created_at: '2026-03-26T10:00:00+09:00',
      },
    ]);

    const { tags } = await import('../../src/routes/tags.js');
    const app = new Hono();
    app.route('/', tags);

    const response = await app.fetch(
      new Request('http://localhost/api/tags'),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'tag-1',
          name: 'VIP',
          color: '#ff0000',
          createdAt: '2026-03-26T10:00:00+09:00',
        },
      ],
    });
  });

  it('rejects creating a tag without a name', async () => {
    const { tags } = await import('../../src/routes/tags.js');
    const app = new Hono();
    app.route('/', tags);

    const response = await app.fetch(
      new Request('http://localhost/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color: '#00ff00' }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'name is required',
    });
  });
});
