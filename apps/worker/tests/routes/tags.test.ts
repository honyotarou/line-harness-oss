import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getTags: vi.fn(),
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  getTagById: vi.fn(),
  countActiveLineAccounts: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

vi.mock('../../src/services/admin-line-account-scope.js', () => ({
  resolveLineAccountScopeForRequest: vi.fn().mockResolvedValue({ mode: 'all' }),
  validateScopedLineAccountQueryParam: vi.fn(() => ({ ok: true })),
  validateScopedLineAccountBody: vi.fn(() => ({ ok: true, lineAccountId: null })),
  resourceLineAccountVisibleInScope: vi.fn(() => true),
  jsonBodyForLineAccountScopeFailure: vi.fn((q: { error: string; code: string }) => ({
    success: false,
    error: q.error,
    code: q.code,
  })),
}));

describe('tag routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.countActiveLineAccounts.mockResolvedValue(1);
  });

  it('lists tags with serialized fields', async () => {
    dbMocks.getTags.mockResolvedValue([
      {
        id: 'tag-1',
        name: 'VIP',
        color: '#ff0000',
        line_account_id: 'acc-1',
        created_at: '2026-03-26T10:00:00+09:00',
      },
    ]);

    const { tags } = await import('../../src/routes/tags.js');
    const app = new Hono();
    app.route('/', tags);

    const response = await app.fetch(new Request('http://localhost/api/tags'), {
      DB: {} as D1Database,
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: 'tag-1',
          name: 'VIP',
          color: '#ff0000',
          lineAccountId: 'acc-1',
          createdAt: '2026-03-26T10:00:00+09:00',
        },
      ],
    });
  });

  it('rejects POST body larger than admin JSON limit with 413', async () => {
    const { DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES } = await import(
      '../../src/services/request-body.js'
    );
    const { tags } = await import('../../src/routes/tags.js');
    const app = new Hono();
    app.route('/', tags);

    const response = await app.fetch(
      new Request('http://localhost/api/tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES + 1),
        },
        body: 'x',
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Request body too large',
    });
    expect(dbMocks.createTag).not.toHaveBeenCalled();
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

  it('creates a tag and returns 201', async () => {
    dbMocks.createTag.mockResolvedValue({
      id: 'new-tag',
      name: 'News',
      color: '#00ff00',
      line_account_id: null,
      created_at: '2026-03-26T12:00:00+09:00',
    });

    const { tags } = await import('../../src/routes/tags.js');
    const app = new Hono();
    app.route('/', tags);

    const response = await app.fetch(
      new Request('http://localhost/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'News', color: '#00ff00' }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'new-tag',
        name: 'News',
        color: '#00ff00',
        lineAccountId: null,
        createdAt: '2026-03-26T12:00:00+09:00',
      },
    });
  });

  it('returns 400 when multiple LINE accounts are active and lineAccountId is omitted on create', async () => {
    dbMocks.countActiveLineAccounts.mockResolvedValue(2);

    const { tags } = await import('../../src/routes/tags.js');
    const app = new Hono();
    app.route('/', tags);

    const response = await app.fetch(
      new Request('http://localhost/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X', color: '#000' }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(400);
    expect(dbMocks.createTag).not.toHaveBeenCalled();
  });

  it('deletes a tag', async () => {
    dbMocks.getTagById.mockResolvedValue({
      id: 'tag-9',
      name: 'T',
      color: '#000',
      line_account_id: 'acc-1',
      created_at: '2026-03-26T10:00:00+09:00',
    });
    dbMocks.deleteTag.mockResolvedValue(undefined);

    const { tags } = await import('../../src/routes/tags.js');
    const app = new Hono();
    app.route('/', tags);

    const response = await app.fetch(
      new Request('http://localhost/api/tags/tag-9', { method: 'DELETE' }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(200);
    expect(dbMocks.deleteTag).toHaveBeenCalledWith(expect.anything(), 'tag-9');
  });

  it('returns 500 when createTag throws', async () => {
    dbMocks.createTag.mockRejectedValue(new Error('db down'));

    const { tags } = await import('../../src/routes/tags.js');
    const app = new Hono();
    app.route('/', tags);

    const response = await app.fetch(
      new Request('http://localhost/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X', color: '#000' }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });

  it('returns 500 when deleteTag throws', async () => {
    dbMocks.getTagById.mockResolvedValue({
      id: 'tag-9',
      name: 'T',
      color: '#000',
      line_account_id: 'acc-1',
      created_at: '2026-03-26T10:00:00+09:00',
    });
    dbMocks.deleteTag.mockRejectedValue(new Error('db down'));

    const { tags } = await import('../../src/routes/tags.js');
    const app = new Hono();
    app.route('/', tags);

    const response = await app.fetch(
      new Request('http://localhost/api/tags/tag-9', { method: 'DELETE' }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });

  it('returns 500 when listing tags fails', async () => {
    dbMocks.getTags.mockRejectedValue(new Error('db down'));

    const { tags } = await import('../../src/routes/tags.js');
    const app = new Hono();
    app.route('/', tags);

    const response = await app.fetch(new Request('http://localhost/api/tags'), {
      DB: {} as D1Database,
    } as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });
});
