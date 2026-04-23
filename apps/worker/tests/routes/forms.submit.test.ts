import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRateLimitD1Stub } from '../helpers/rate-limit-d1-stub.js';

const dbMocks = vi.hoisted(() => ({
  getForms: vi.fn(),
  getFormById: vi.fn(),
  createForm: vi.fn(),
  updateForm: vi.fn(),
  deleteForm: vi.fn(),
  getFormSubmissions: vi.fn(),
  createFormSubmission: vi.fn(),
  jstNow: vi.fn(() => '2026-03-25T10:00:00+09:00'),
  listFriendsByLineUserId: vi.fn(),
  getFriendById: vi.fn(),
  addTagToFriend: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  getLineAccounts: vi.fn(),
  getLineAccountById: vi.fn(),
  getTagById: vi.fn(),
  getScenarioById: vi.fn(),
  countActiveLineAccounts: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

const lineSdkMocks = vi.hoisted(() => ({
  pushMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@line-crm/line-sdk', () => ({
  createLineClient: vi.fn().mockImplementation(() => ({
    pushMessage: lineSdkMocks.pushMessage,
  })),
}));

describe('public form submit route', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.getLineAccountById.mockResolvedValue(null);
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
        DB: createRateLimitD1Stub(),
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
    dbMocks.listFriendsByLineUserId.mockResolvedValue([
      {
        id: 'friend-real',
        line_user_id: 'real-user-id',
        display_name: 'Real User',
        metadata: '{}',
        line_account_id: null,
        picture_url: null,
        status_message: null,
        is_following: 1,
        user_id: null,
        created_at: '2026-03-25T10:00:00+09:00',
        updated_at: '2026-03-25T10:00:00+09:00',
      },
    ]);
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
        DB: createRateLimitD1Stub(),
        LINE_LOGIN_CHANNEL_ID: 'default-login-channel',
        LINE_CHANNEL_ACCESS_TOKEN: 'default-access-token',
      } as never,
    );

    expect(response.status).toBe(201);
    expect(dbMocks.listFriendsByLineUserId).toHaveBeenCalledWith(expect.anything(), 'real-user-id');
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
    dbMocks.listFriendsByLineUserId.mockResolvedValue([
      {
        id: 'friend-real',
        line_user_id: 'real-user-id',
        display_name: 'Real User',
        metadata: '{}',
        line_account_id: null,
        picture_url: null,
        status_message: null,
        is_following: 1,
        user_id: null,
        created_at: '2026-03-25T10:00:00+09:00',
        updated_at: '2026-03-25T10:00:00+09:00',
      },
    ]);
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
        DB: createRateLimitD1Stub(),
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
    const rateLimitDb = createRateLimitD1Stub();
    const db = {
      prepare(sql: string) {
        if (sql.includes('request_rate_limits')) {
          return rateLimitDb.prepare(sql);
        }
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
    dbMocks.listFriendsByLineUserId.mockResolvedValue([
      {
        id: 'friend-real',
        line_user_id: 'real-user-id',
        display_name: 'Real User',
        metadata: '{}',
        line_account_id: null,
        picture_url: null,
        status_message: null,
        is_following: 1,
        user_id: null,
        created_at: '2026-03-25T10:00:00+09:00',
        updated_at: '2026-03-25T10:00:00+09:00',
      },
    ]);
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
        DB: createRateLimitD1Stub(),
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

    const rateLimitDb = createRateLimitD1Stub();
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
          DB: rateLimitDb,
          LINE_LOGIN_CHANNEL_ID: 'default-login-channel',
          LINE_CHANNEL_ACCESS_TOKEN: 'default-access-token',
        } as never,
      );
    }

    expect(response?.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the verified login channel does not match the friend LINE account', async () => {
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
    dbMocks.listFriendsByLineUserId.mockResolvedValue([
      {
        id: 'friend-acc',
        line_user_id: 'real-user-id',
        display_name: 'Real User',
        metadata: '{}',
        line_account_id: 'acc-1',
        picture_url: null,
        status_message: null,
        is_following: 1,
        user_id: null,
        created_at: '2026-03-25T10:00:00+09:00',
        updated_at: '2026-03-25T10:00:00+09:00',
      },
    ]);
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'acc-1',
      channel_id: 'c',
      name: 'A',
      channel_access_token: 't',
      channel_secret: 's',
      login_channel_id: 'other-channel',
      login_channel_secret: null,
      liff_id: null,
      is_active: 1,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });

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
        body: JSON.stringify({ idToken: 'valid-id-token', data: { name: 'A' } }),
      }),
      {
        DB: createRateLimitD1Stub(),
        LINE_LOGIN_CHANNEL_ID: 'default-login-channel',
        LINE_CHANNEL_ACCESS_TOKEN: 'default-access-token',
      } as never,
    );

    expect(response.status).toBe(404);
    expect(dbMocks.createFormSubmission).not.toHaveBeenCalled();
  });

  it('returns 409 when two friend rows tie-break on the same LINE login channel', async () => {
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
    const row = {
      line_user_id: 'real-user-id',
      display_name: 'Real User',
      metadata: '{}',
      line_account_id: null,
      picture_url: null,
      status_message: null,
      is_following: 1,
      user_id: null,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    };
    dbMocks.listFriendsByLineUserId.mockResolvedValue([
      { ...row, id: 'friend-a' },
      { ...row, id: 'friend-b' },
    ]);

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
        body: JSON.stringify({ idToken: 'valid-id-token', data: { name: 'A' } }),
      }),
      {
        DB: createRateLimitD1Stub(),
        LINE_LOGIN_CHANNEL_ID: 'default-login-channel',
        LINE_CHANNEL_ACCESS_TOKEN: 'default-access-token',
      } as never,
    );

    expect(response.status).toBe(409);
    expect(dbMocks.createFormSubmission).not.toHaveBeenCalled();
  });

  it('skips cross-tenant on_submit_tag_id when tag belongs to a different LINE account', async () => {
    dbMocks.getFormById.mockResolvedValue({
      id: 'form-1',
      name: '診断フォーム',
      description: null,
      fields: '[]',
      on_submit_tag_id: 'tag-tenant-b',
      on_submit_scenario_id: null,
      save_to_metadata: 0,
      is_active: 1,
      submit_count: 0,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });
    dbMocks.getLineAccounts.mockResolvedValue([]);
    dbMocks.countActiveLineAccounts.mockResolvedValue(2);
    dbMocks.listFriendsByLineUserId.mockResolvedValue([
      {
        id: 'friend-in-a',
        line_user_id: 'real-user-id',
        display_name: 'Real User',
        metadata: '{}',
        line_account_id: 'acc-A',
        picture_url: null,
        status_message: null,
        is_following: 1,
        user_id: null,
        created_at: '2026-03-25T10:00:00+09:00',
        updated_at: '2026-03-25T10:00:00+09:00',
      },
    ]);
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'acc-A',
      channel_id: 'c',
      name: 'A',
      channel_access_token: 't',
      channel_secret: 's',
      login_channel_id: 'default-login-channel',
      login_channel_secret: null,
      liff_id: null,
      is_active: 1,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-in-a',
      line_user_id: 'real-user-id',
      display_name: 'Real User',
      metadata: '{}',
      line_account_id: 'acc-A',
    });
    dbMocks.getTagById.mockResolvedValue({
      id: 'tag-tenant-b',
      name: 'VIP',
      color: null,
      line_account_id: 'acc-B',
      created_at: '2026-03-25T10:00:00+09:00',
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
        body: JSON.stringify({ idToken: 'valid-id-token', data: { name: 'A' } }),
      }),
      {
        DB: createRateLimitD1Stub(),
        LINE_LOGIN_CHANNEL_ID: 'default-login-channel',
        LINE_CHANNEL_ACCESS_TOKEN: 'default-access-token',
      } as never,
    );

    expect(response.status).toBe(201);
    expect(dbMocks.addTagToFriend).not.toHaveBeenCalled();
  });

  it('skips cross-tenant on_submit_scenario_id when scenario belongs to a different LINE account', async () => {
    dbMocks.getFormById.mockResolvedValue({
      id: 'form-1',
      name: '診断フォーム',
      description: null,
      fields: '[]',
      on_submit_tag_id: null,
      on_submit_scenario_id: 'scenario-tenant-b',
      save_to_metadata: 0,
      is_active: 1,
      submit_count: 0,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });
    dbMocks.getLineAccounts.mockResolvedValue([]);
    dbMocks.countActiveLineAccounts.mockResolvedValue(2);
    dbMocks.listFriendsByLineUserId.mockResolvedValue([
      {
        id: 'friend-in-a',
        line_user_id: 'real-user-id',
        display_name: 'Real User',
        metadata: '{}',
        line_account_id: 'acc-A',
        picture_url: null,
        status_message: null,
        is_following: 1,
        user_id: null,
        created_at: '2026-03-25T10:00:00+09:00',
        updated_at: '2026-03-25T10:00:00+09:00',
      },
    ]);
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'acc-A',
      channel_id: 'c',
      name: 'A',
      channel_access_token: 't',
      channel_secret: 's',
      login_channel_id: 'default-login-channel',
      login_channel_secret: null,
      liff_id: null,
      is_active: 1,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-in-a',
      line_user_id: 'real-user-id',
      display_name: 'Real User',
      metadata: '{}',
      line_account_id: 'acc-A',
    });
    dbMocks.getScenarioById.mockResolvedValue({
      id: 'scenario-tenant-b',
      name: 'Welcome B',
      line_account_id: 'acc-B',
    });
    dbMocks.createFormSubmission.mockImplementation(
      async (
        _db: D1Database,
        input: { formId: string; friendId: string | null; data: string },
      ) => ({
        id: 'submission-2',
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
        body: JSON.stringify({ idToken: 'valid-id-token', data: { name: 'A' } }),
      }),
      {
        DB: createRateLimitD1Stub(),
        LINE_LOGIN_CHANNEL_ID: 'default-login-channel',
        LINE_CHANNEL_ACCESS_TOKEN: 'default-access-token',
      } as never,
    );

    expect(response.status).toBe(201);
    expect(dbMocks.enrollFriendInScenario).not.toHaveBeenCalled();
  });

  it('applies on_submit_tag_id when tag belongs to the same LINE account as the friend', async () => {
    dbMocks.getFormById.mockResolvedValue({
      id: 'form-1',
      name: '診断フォーム',
      description: null,
      fields: '[]',
      on_submit_tag_id: 'tag-tenant-a',
      on_submit_scenario_id: null,
      save_to_metadata: 0,
      is_active: 1,
      submit_count: 0,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });
    dbMocks.getLineAccounts.mockResolvedValue([]);
    dbMocks.countActiveLineAccounts.mockResolvedValue(2);
    dbMocks.listFriendsByLineUserId.mockResolvedValue([
      {
        id: 'friend-in-a',
        line_user_id: 'real-user-id',
        display_name: 'Real User',
        metadata: '{}',
        line_account_id: 'acc-A',
        picture_url: null,
        status_message: null,
        is_following: 1,
        user_id: null,
        created_at: '2026-03-25T10:00:00+09:00',
        updated_at: '2026-03-25T10:00:00+09:00',
      },
    ]);
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'acc-A',
      channel_id: 'c',
      name: 'A',
      channel_access_token: 't',
      channel_secret: 's',
      login_channel_id: 'default-login-channel',
      login_channel_secret: null,
      liff_id: null,
      is_active: 1,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-in-a',
      line_user_id: 'real-user-id',
      display_name: 'Real User',
      metadata: '{}',
      line_account_id: 'acc-A',
    });
    dbMocks.getTagById.mockResolvedValue({
      id: 'tag-tenant-a',
      name: 'VIP',
      color: null,
      line_account_id: 'acc-A',
      created_at: '2026-03-25T10:00:00+09:00',
    });
    dbMocks.createFormSubmission.mockImplementation(
      async (
        _db: D1Database,
        input: { formId: string; friendId: string | null; data: string },
      ) => ({
        id: 'submission-ok',
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
        body: JSON.stringify({ idToken: 'valid-id-token', data: { name: 'A' } }),
      }),
      {
        DB: createRateLimitD1Stub(),
        LINE_LOGIN_CHANNEL_ID: 'default-login-channel',
        LINE_CHANNEL_ACCESS_TOKEN: 'default-access-token',
      } as never,
    );

    expect(response.status).toBe(201);
    expect(dbMocks.addTagToFriend).toHaveBeenCalledWith(
      expect.anything(),
      'friend-in-a',
      'tag-tenant-a',
    );
  });
});
