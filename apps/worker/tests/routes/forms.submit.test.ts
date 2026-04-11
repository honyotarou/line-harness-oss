import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getForms: vi.fn(),
  getFormById: vi.fn(),
  createForm: vi.fn(),
  updateForm: vi.fn(),
  deleteForm: vi.fn(),
  getFormSubmissions: vi.fn(),
  createFormSubmission: vi.fn(),
  jstNow: vi.fn(() => '2026-03-25T10:00:00+09:00'),
  getFriendByLineUserId: vi.fn(),
  getFriendById: vi.fn(),
  addTagToFriend: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  getLineAccounts: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

const lineSdkMocks = vi.hoisted(() => ({
  pushMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@line-crm/line-sdk', () => ({
  LineClient: vi.fn().mockImplementation(() => ({
    pushMessage: lineSdkMocks.pushMessage,
  })),
}));

describe('public form submit route', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    lineSdkMocks.pushMessage.mockClear();
    vi.unstubAllGlobals();
  });

  it('rejects unauthenticated public submissions without an id token', async () => {
    dbMocks.getFormById.mockResolvedValue({
      id: 'form-1',
      name: '診断フォーム',
      description: null,
      fields: '[]',
      on_submit_tag_id: null,
      on_submit_scenario_id: null,
      save_to_metadata: 0,
      is_active: 1,
      submit_count: 0,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });

    const { forms } = await import('../../src/routes/forms.js');
    const app = new Hono();
    app.route('/', forms);

    const response = await app.fetch(
      new Request('http://localhost/api/forms/form-1/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { name: 'Alice' } }),
      }),
      {
        DB: {} as D1Database,
        LINE_LOGIN_CHANNEL_ID: 'default-login-channel',
        LINE_CHANNEL_ACCESS_TOKEN: 'default-access-token',
      } as never,
    );

    expect(response.status).toBe(401);
    expect(dbMocks.createFormSubmission).not.toHaveBeenCalled();
  });

  it('uses the verified id token subject instead of spoofable friend identifiers', async () => {
    dbMocks.getFormById.mockResolvedValue({
      id: 'form-1',
      name: '診断フォーム',
      description: null,
      fields: '[]',
      on_submit_tag_id: null,
      on_submit_scenario_id: null,
      save_to_metadata: 0,
      is_active: 1,
      submit_count: 0,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });
    dbMocks.getLineAccounts.mockResolvedValue([]);
    dbMocks.getFriendByLineUserId.mockResolvedValue({
      id: 'friend-real',
      line_user_id: 'real-user-id',
      display_name: 'Real User',
      metadata: '{}',
    });
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-real',
      line_user_id: 'real-user-id',
      display_name: 'Real User',
      metadata: '{}',
    });
    dbMocks.createFormSubmission.mockImplementation(
      async (
        _db: D1Database,
        input: { formId: string; friendId: string | null; data: string },
      ) => ({
        id: 'submission-1',
        form_id: input.formId,
        friend_id: input.friendId,
        data: input.data,
        created_at: '2026-03-25T10:00:00+09:00',
      }),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sub: 'real-user-id', aud: 'default-login-channel' }),
      }),
    );

    const { forms } = await import('../../src/routes/forms.js');
    const app = new Hono();
    app.route('/', forms);

    const response = await app.fetch(
      new Request('http://localhost/api/forms/form-1/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: 'valid-id-token',
          lineUserId: 'spoofed-line-user-id',
          friendId: 'spoofed-friend-id',
          data: { name: 'Alice' },
        }),
      }),
      {
        DB: {} as D1Database,
        LINE_LOGIN_CHANNEL_ID: 'default-login-channel',
        LINE_CHANNEL_ACCESS_TOKEN: 'default-access-token',
      } as never,
    );

    expect(response.status).toBe(201);
    expect(dbMocks.getFriendByLineUserId).toHaveBeenCalledWith(expect.anything(), 'real-user-id');
    expect(dbMocks.createFormSubmission).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        friendId: 'friend-real',
      }),
    );

    expect(lineSdkMocks.pushMessage).toHaveBeenCalled();
    const pushed = lineSdkMocks.pushMessage.mock.calls[0]?.[1]?.[0] as {
      type: string;
      contents?: unknown;
    };
    expect(pushed?.type).toBe('flex');
    const flexJson = JSON.stringify(pushed?.contents);
    expect(flexJson).not.toContain('L社');
    expect(flexJson).toContain('アカウントに記録');
  });

  it('uses FORM_SUBMIT_FLEX_FOOTER for the LINE flex footer when set', async () => {
    dbMocks.getFormById.mockResolvedValue({
      id: 'form-1',
      name: '診断フォーム',
      description: null,
      fields: '[]',
      on_submit_tag_id: null,
      on_submit_scenario_id: null,
      save_to_metadata: 0,
      is_active: 1,
      submit_count: 0,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });
    dbMocks.getLineAccounts.mockResolvedValue([]);
    dbMocks.getFriendByLineUserId.mockResolvedValue({
      id: 'friend-real',
      line_user_id: 'real-user-id',
      display_name: 'Real User',
      metadata: '{}',
    });
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-real',
      line_user_id: 'real-user-id',
      display_name: 'Real User',
      metadata: '{}',
    });
    dbMocks.createFormSubmission.mockImplementation(
      async (
        _db: D1Database,
        input: { formId: string; friendId: string | null; data: string },
      ) => ({
        id: 'submission-1',
        form_id: input.formId,
        friend_id: input.friendId,
        data: input.data,
        created_at: '2026-03-25T10:00:00+09:00',
      }),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sub: 'real-user-id', aud: 'default-login-channel' }),
      }),
    );

    const { forms } = await import('../../src/routes/forms.js');
    const app = new Hono();
    app.route('/', forms);

    const response = await app.fetch(
      new Request('http://localhost/api/forms/form-1/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: 'valid-id-token',
          data: { name: 'Bob' },
        }),
      }),
      {
        DB: {} as D1Database,
        LINE_LOGIN_CHANNEL_ID: 'default-login-channel',
        LINE_CHANNEL_ACCESS_TOKEN: 'default-access-token',
        FORM_SUBMIT_FLEX_FOOTER: 'カスタムフッター文言',
      } as never,
    );

    expect(response.status).toBe(201);
    const pushed = lineSdkMocks.pushMessage.mock.calls[0]?.[1]?.[0] as {
      type: string;
      contents?: unknown;
    };
    expect(JSON.stringify(pushed?.contents)).toContain('カスタムフッター文言');
  });

  it('merges only declared form field keys into friend metadata (blocks arbitrary metadata injection)', async () => {
    let savedMetadata = '';
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async run() {
                if (sql.includes('UPDATE friends SET metadata')) {
                  savedMetadata = String(args[0]);
                }
                return { success: true };
              },
              async first<T>() {
                return null as T;
              },
              async all<T>() {
                return { results: [] as T[] };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    dbMocks.getFormById.mockResolvedValue({
      id: 'form-1',
      name: '診断フォーム',
      description: null,
      fields: JSON.stringify([{ name: 'q', label: 'Q', type: 'text', required: false }]),
      on_submit_tag_id: null,
      on_submit_scenario_id: null,
      save_to_metadata: 1,
      is_active: 1,
      submit_count: 0,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });
    dbMocks.getLineAccounts.mockResolvedValue([]);
    dbMocks.getFriendByLineUserId.mockResolvedValue({
      id: 'friend-real',
      line_user_id: 'real-user-id',
      display_name: 'Real User',
      metadata: '{}',
    });
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-real',
      line_user_id: 'real-user-id',
      display_name: 'Real User',
      metadata: '{"score":1}',
    });
    dbMocks.createFormSubmission.mockImplementation(
      async (
        _db: D1Database,
        input: { formId: string; friendId: string | null; data: string },
      ) => ({
        id: 'submission-1',
        form_id: input.formId,
        friend_id: input.friendId,
        data: input.data,
        created_at: '2026-03-25T10:00:00+09:00',
      }),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sub: 'real-user-id', aud: 'default-login-channel' }),
      }),
    );

    const { forms } = await import('../../src/routes/forms.js');
    const app = new Hono();
    app.route('/', forms);

    const response = await app.fetch(
      new Request('http://localhost/api/forms/form-1/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: 'valid-id-token',
          data: { q: 'answer', __internal_score: '999', admin_notes: 'pwned' },
        }),
      }),
      {
        DB: db,
        LINE_LOGIN_CHANNEL_ID: 'default-login-channel',
        LINE_CHANNEL_ACCESS_TOKEN: 'default-access-token',
      } as never,
    );

    expect(response.status).toBe(201);
    const meta = JSON.parse(savedMetadata) as Record<string, unknown>;
    expect(meta.q).toBe('answer');
    expect(meta.score).toBe(1);
    expect(meta.__internal_score).toBeUndefined();
    expect(meta.admin_notes).toBeUndefined();
  });

  it('rejects oversized public submissions before verifying the id token', async () => {
    dbMocks.getFormById.mockResolvedValue({
      id: 'form-1',
      name: '診断フォーム',
      description: null,
      fields: '[]',
      on_submit_tag_id: null,
      on_submit_scenario_id: null,
      save_to_metadata: 0,
      is_active: 1,
      submit_count: 0,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { forms } = await import('../../src/routes/forms.js');
    const app = new Hono();
    app.route('/', forms);

    const payload = JSON.stringify({
      idToken: 'valid-id-token',
      data: { notes: 'x'.repeat(70_000) },
    });
    const response = await app.fetch(
      new Request('http://localhost/api/forms/form-1/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(payload.length),
        },
        body: payload,
      }),
      {
        DB: {} as D1Database,
        LINE_LOGIN_CHANNEL_ID: 'default-login-channel',
        LINE_CHANNEL_ACCESS_TOKEN: 'default-access-token',
      } as never,
    );

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dbMocks.createFormSubmission).not.toHaveBeenCalled();
  });

  it('rate limits repeated public submissions from the same client', async () => {
    dbMocks.getFormById.mockResolvedValue({
      id: 'form-1',
      name: '診断フォーム',
      description: null,
      fields: '[]',
      on_submit_tag_id: null,
      on_submit_scenario_id: null,
      save_to_metadata: 0,
      is_active: 1,
      submit_count: 0,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { forms } = await import('../../src/routes/forms.js');
    const app = new Hono();
    app.route('/', forms);

    let response: Response | undefined;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await app.fetch(
        new Request('http://localhost/api/forms/form-1/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '198.51.100.20',
          },
          body: JSON.stringify({ data: { name: 'Alice' } }),
        }),
        {
          DB: {} as D1Database,
          LINE_LOGIN_CHANNEL_ID: 'default-login-channel',
          LINE_CHANNEL_ACCESS_TOKEN: 'default-access-token',
        } as never,
      );
    }

    expect(response?.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
