import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  upsertFriend: vi.fn(),
  updateFriendFollowStatus: vi.fn(),
  getFriendByLineUserId: vi.fn(),
  getScenarios: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  getScenarioSteps: vi.fn(),
  advanceFriendScenario: vi.fn(),
  completeFriendScenario: vi.fn(),
  upsertChatOnMessage: vi.fn(),
  getLineAccounts: vi.fn(),
  jstNow: vi.fn(() => '2026-03-25T10:00:00+09:00'),
}));

vi.mock('@line-crm/db', () => dbMocks);

const lineSdkMocks = vi.hoisted(() => ({
  verifySignature: vi.fn().mockResolvedValue(true),
  replyMessage: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock('@line-crm/line-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@line-crm/line-sdk')>();
  return {
    ...actual,
    verifySignature: lineSdkMocks.verifySignature,
    LineClient: vi.fn().mockImplementation(() => ({
      replyMessage: lineSdkMocks.replyMessage,
      getProfile: lineSdkMocks.getProfile,
    })),
  };
});

const eventBusMocks = vi.hoisted(() => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/event-bus.js', () => eventBusMocks);

vi.mock('../../src/services/step-delivery.js', () => ({
  buildMessage: vi.fn((type: string, content: string) => ({ type, text: content })),
  expandVariables: vi.fn((value: string) => value),
}));

function executionCtxWithPending() {
  const pending: Promise<unknown>[] = [];
  return {
    pending,
    ctx: {
      waitUntil: (p: Promise<unknown>) => {
        pending.push(p);
      },
    } as ExecutionContext,
  };
}

/** Minimal D1 mock for text message path (incoming log + empty auto_replies). */
function createMessageFlowDb() {
  const chain = {
    run: vi.fn().mockResolvedValue({}),
    all: vi.fn().mockResolvedValue({ results: [] }),
    first: vi.fn().mockResolvedValue(null),
  };
  return {
    prepare: vi.fn().mockImplementation(() => ({
      bind: vi.fn().mockReturnValue(chain),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({}),
      first: vi.fn().mockResolvedValue(null),
    })),
  } as unknown as D1Database;
}

describe('line webhook route', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.getLineAccounts.mockResolvedValue([]);
    lineSdkMocks.verifySignature.mockClear();
    lineSdkMocks.verifySignature.mockResolvedValue(true);
    lineSdkMocks.replyMessage.mockClear();
    lineSdkMocks.getProfile.mockClear();
    eventBusMocks.fireEvent.mockClear();
  });

  it('rejects oversized webhook payloads before signature verification', async () => {
    const { webhook } = await import('../../src/routes/webhook.js');
    const app = new Hono();
    app.route('/', webhook);

    const body = JSON.stringify({ events: [], padding: 'x'.repeat(300_000) });
    const response = await app.fetch(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(body.length),
          'X-Line-Signature': 'valid-signature',
        },
        body,
      }),
      {
        DB: {} as D1Database,
        LINE_CHANNEL_SECRET: 'line-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'line-access-token',
        WORKER_URL: 'https://worker.example.com',
      } as never,
    );

    expect(response.status).toBe(413);
    expect(lineSdkMocks.verifySignature).not.toHaveBeenCalled();
  });

  it('returns 200 on malformed JSON without verifying signature', async () => {
    const { webhook } = await import('../../src/routes/webhook.js');
    const app = new Hono();
    app.route('/', webhook);

    const response = await app.fetch(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Line-Signature': 'sig',
        },
        body: '{"events":[',
      }),
      {
        DB: {} as D1Database,
        LINE_CHANNEL_SECRET: 'line-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'line-access-token',
        WORKER_URL: 'https://worker.example.com',
      } as never,
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { status: string };
    expect(json.status).toBe('ok');
    expect(lineSdkMocks.verifySignature).not.toHaveBeenCalled();
  });

  it('returns 200 when signature is invalid (LINE-compatible)', async () => {
    lineSdkMocks.verifySignature.mockResolvedValue(false);
    const { webhook } = await import('../../src/routes/webhook.js');
    const app = new Hono();
    app.route('/', webhook);

    const body = JSON.stringify({ events: [] });
    const response = await app.fetch(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Line-Signature': 'bad',
        },
        body,
      }),
      {
        DB: {} as D1Database,
        LINE_CHANNEL_SECRET: 'line-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'line-access-token',
        WORKER_URL: 'https://worker.example.com',
      } as never,
    );

    expect(response.status).toBe(200);
    expect(lineSdkMocks.verifySignature).toHaveBeenCalled();
  });

  it('accepts valid signature with empty events', async () => {
    const pending: Promise<unknown>[] = [];
    const executionCtx = {
      waitUntil: (p: Promise<unknown>) => {
        pending.push(p);
      },
    } as ExecutionContext;

    const { webhook } = await import('../../src/routes/webhook.js');
    const app = new Hono();
    app.route('/', webhook);

    const body = JSON.stringify({ events: [] });
    const response = await app.fetch(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Line-Signature': 'good',
        },
        body,
      }),
      {
        DB: {} as D1Database,
        LINE_CHANNEL_SECRET: 'line-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'line-access-token',
        WORKER_URL: 'https://worker.example.com',
      } as never,
      executionCtx,
    );

    expect(response.status).toBe(200);
    await Promise.all(pending);
    expect(lineSdkMocks.verifySignature).toHaveBeenCalled();
  });

  it('resolves credentials from DB when destination matches an account signature', async () => {
    dbMocks.getLineAccounts.mockResolvedValue([
      {
        id: 'acc-db-1',
        is_active: 1,
        channel_secret: 'secret-from-db',
        channel_access_token: 'token-from-db',
      },
    ]);
    lineSdkMocks.verifySignature.mockImplementation(
      async (secret: string) => secret === 'secret-from-db',
    );

    const pending: Promise<unknown>[] = [];
    const executionCtx = {
      waitUntil: (p: Promise<unknown>) => {
        pending.push(p);
      },
    } as ExecutionContext;

    const { webhook } = await import('../../src/routes/webhook.js');
    const app = new Hono();
    app.route('/', webhook);

    const body = JSON.stringify({ destination: 'Uxxx', events: [] });
    const response = await app.fetch(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Line-Signature': 'sig',
        },
        body,
      }),
      {
        DB: {} as D1Database,
        LINE_CHANNEL_SECRET: 'line-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'line-access-token',
        WORKER_URL: 'https://worker.example.com',
      } as never,
      executionCtx,
    );

    expect(response.status).toBe(200);
    await Promise.all(pending);
    expect(dbMocks.getLineAccounts).toHaveBeenCalled();
    expect(lineSdkMocks.verifySignature).toHaveBeenCalled();
  });

  it('processes unfollow and updates follow status', async () => {
    const pending: Promise<unknown>[] = [];
    const executionCtx = {
      waitUntil: (p: Promise<unknown>) => {
        pending.push(p);
      },
    } as ExecutionContext;

    const { webhook } = await import('../../src/routes/webhook.js');
    const app = new Hono();
    app.route('/', webhook);

    const body = JSON.stringify({
      events: [
        {
          type: 'unfollow',
          source: { type: 'user', userId: 'Uunfollow' },
        },
      ],
    });

    const response = await app.fetch(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Line-Signature': 'ok',
        },
        body,
      }),
      {
        DB: {} as D1Database,
        LINE_CHANNEL_SECRET: 'line-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'line-access-token',
        WORKER_URL: 'https://worker.example.com',
      } as never,
      executionCtx,
    );

    expect(response.status).toBe(200);
    await Promise.all(pending);
    expect(dbMocks.updateFriendFollowStatus).toHaveBeenCalledWith(
      expect.anything(),
      'Uunfollow',
      false,
    );
  });

  it('follow upserts friend, loads scenarios, and fires friend_add', async () => {
    const { pending, ctx } = executionCtxWithPending();
    lineSdkMocks.getProfile.mockResolvedValue({
      displayName: 'Follower',
      pictureUrl: 'https://p.example/u.jpg',
      statusMessage: null,
    });
    dbMocks.upsertFriend.mockResolvedValue({
      id: 'friend-follow-1',
      display_name: 'Follower',
    });
    dbMocks.getScenarios.mockResolvedValue([]);

    const { webhook } = await import('../../src/routes/webhook.js');
    const app = new Hono();
    app.route('/', webhook);

    const body = JSON.stringify({
      events: [
        {
          type: 'follow',
          mode: 'active',
          source: { type: 'user', userId: 'Ufollow99' },
          replyToken: 'reply-tok-follow',
        },
      ],
    });

    const response = await app.fetch(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Line-Signature': 'ok',
        },
        body,
      }),
      {
        DB: {} as D1Database,
        LINE_CHANNEL_SECRET: 'line-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'line-access-token',
        WORKER_URL: 'https://worker.example.com',
      } as never,
      ctx,
    );

    expect(response.status).toBe(200);
    await Promise.all(pending);
    expect(lineSdkMocks.getProfile).toHaveBeenCalledWith('Ufollow99');
    expect(dbMocks.upsertFriend).toHaveBeenCalledWith(expect.anything(), {
      lineUserId: 'Ufollow99',
      displayName: 'Follower',
      pictureUrl: 'https://p.example/u.jpg',
      statusMessage: null,
    });
    expect(dbMocks.getScenarios).toHaveBeenCalled();
    expect(eventBusMocks.fireEvent).toHaveBeenCalledWith(
      expect.anything(),
      'friend_add',
      { friendId: 'friend-follow-1', eventData: { displayName: 'Follower' } },
      'line-access-token',
      null,
    );
  });

  it('follow with matched account sets line_account_id on friend', async () => {
    const { pending, ctx } = executionCtxWithPending();
    dbMocks.getLineAccounts.mockResolvedValue([
      {
        id: 'acc-line-1',
        is_active: 1,
        channel_secret: 'secret-from-db',
        channel_access_token: 'token-from-db',
      },
    ]);
    lineSdkMocks.verifySignature.mockImplementation(
      async (secret: string) => secret === 'secret-from-db',
    );
    lineSdkMocks.getProfile.mockResolvedValue({
      displayName: 'M',
      pictureUrl: null,
      statusMessage: null,
    });
    dbMocks.upsertFriend.mockResolvedValue({
      id: 'friend-ma',
      display_name: 'M',
    });
    dbMocks.getScenarios.mockResolvedValue([]);

    const runMock = vi.fn().mockResolvedValue({});
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: runMock,
          first: vi.fn(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      }),
    } as unknown as D1Database;

    const { webhook } = await import('../../src/routes/webhook.js');
    const app = new Hono();
    app.route('/', webhook);

    const body = JSON.stringify({
      destination: 'Udest',
      events: [
        {
          type: 'follow',
          source: { type: 'user', userId: 'Umulti' },
          replyToken: 'rt',
        },
      ],
    });

    const response = await app.fetch(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Line-Signature': 'sig',
        },
        body,
      }),
      {
        DB: db,
        LINE_CHANNEL_SECRET: 'line-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'line-access-token',
        WORKER_URL: 'https://worker.example.com',
      } as never,
      ctx,
    );

    expect(response.status).toBe(200);
    await Promise.all(pending);
    expect(db.prepare).toHaveBeenCalledWith(
      'UPDATE friends SET line_account_id = ? WHERE id = ? AND line_account_id IS NULL',
    );
    expect(runMock).toHaveBeenCalled();
    expect(eventBusMocks.fireEvent).toHaveBeenCalledWith(
      expect.anything(),
      'friend_add',
      expect.any(Object),
      'token-from-db',
      'acc-line-1',
    );
  });

  it('postback anxiety=paper updates metadata and replies with flex', async () => {
    const { pending, ctx } = executionCtxWithPending();
    const runMock = vi.fn().mockResolvedValue({});
    const firstMock = vi.fn().mockResolvedValueOnce({ metadata: '{}' }).mockResolvedValue(null);
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: runMock,
          first: firstMock,
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
        run: runMock,
        first: firstMock,
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    } as unknown as D1Database;

    dbMocks.getFriendByLineUserId.mockResolvedValue({
      id: 'f-pb-1',
      line_user_id: 'Upost',
      display_name: 'Pb',
      user_id: null,
    });

    const { webhook } = await import('../../src/routes/webhook.js');
    const app = new Hono();
    app.route('/', webhook);

    const body = JSON.stringify({
      events: [
        {
          type: 'postback',
          postback: { data: 'anxiety=ortho' },
          source: { type: 'user', userId: 'Upost' },
          replyToken: 'rt-pb',
        },
      ],
    });

    const response = await app.fetch(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Line-Signature': 'ok',
        },
        body,
      }),
      {
        DB: db,
        LINE_CHANNEL_SECRET: 'line-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'line-access-token',
        WORKER_URL: 'https://worker.example.com',
        LIFF_URL: 'https://liff.line.me/x',
      } as never,
      ctx,
    );

    expect(response.status).toBe(200);
    await Promise.all(pending);
    expect(lineSdkMocks.replyMessage).toHaveBeenCalledWith('rt-pb', [
      expect.objectContaining({ type: 'flex' }),
    ]);
    expect(dbMocks.getFriendByLineUserId).toHaveBeenCalledWith(db, 'Upost');
    expect(runMock).toHaveBeenCalled();
  });

  it('postback anxiety still works when stored friend metadata JSON is corrupt', async () => {
    const { pending, ctx } = executionCtxWithPending();
    const runMock = vi.fn().mockResolvedValue({});
    const firstMock = vi.fn().mockResolvedValueOnce({ metadata: '{bad' }).mockResolvedValue(null);
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: runMock,
          first: firstMock,
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
        run: runMock,
        first: firstMock,
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    } as unknown as D1Database;

    dbMocks.getFriendByLineUserId.mockResolvedValue({
      id: 'f-pb-2',
      line_user_id: 'Upost2',
      display_name: 'Pb2',
      user_id: null,
    });

    const { webhook } = await import('../../src/routes/webhook.js');
    const app = new Hono();
    app.route('/', webhook);

    const body = JSON.stringify({
      events: [
        {
          type: 'postback',
          postback: { data: 'anxiety=ortho' },
          source: { type: 'user', userId: 'Upost2' },
          replyToken: 'rt-pb2',
        },
      ],
    });

    const response = await app.fetch(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Line-Signature': 'ok',
        },
        body,
      }),
      {
        DB: db,
        LINE_CHANNEL_SECRET: 'line-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'line-access-token',
        WORKER_URL: 'https://worker.example.com',
        LIFF_URL: 'https://liff.line.me/x',
      } as never,
      ctx,
    );

    expect(response.status).toBe(200);
    await Promise.all(pending);
    expect(lineSdkMocks.replyMessage).toHaveBeenCalledWith('rt-pb2', [
      expect.objectContaining({ type: 'flex' }),
    ]);
    expect(runMock).toHaveBeenCalled();
  });

  it('text message logs incoming, upserts chat, and fires message_received', async () => {
    const { pending, ctx } = executionCtxWithPending();
    const db = createMessageFlowDb();
    dbMocks.getFriendByLineUserId.mockResolvedValue({
      id: 'f-msg-1',
      line_user_id: 'Umsg1',
      display_name: 'Chatty',
      user_id: null,
    });

    const { webhook } = await import('../../src/routes/webhook.js');
    const app = new Hono();
    app.route('/', webhook);

    const body = JSON.stringify({
      events: [
        {
          type: 'message',
          message: { type: 'text', id: 'mid', text: 'hello harness' },
          source: { type: 'user', userId: 'Umsg1' },
          replyToken: 'rt-msg',
        },
      ],
    });

    const response = await app.fetch(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Line-Signature': 'ok',
        },
        body,
      }),
      {
        DB: db,
        LINE_CHANNEL_SECRET: 'line-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'line-access-token',
        WORKER_URL: 'https://worker.example.com',
      } as never,
      ctx,
    );

    expect(response.status).toBe(200);
    await Promise.all(pending);
    expect(dbMocks.getFriendByLineUserId).toHaveBeenCalledWith(db, 'Umsg1');
    expect(dbMocks.upsertChatOnMessage).toHaveBeenCalledWith(db, 'f-msg-1');
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO messages_log'));
    expect(eventBusMocks.fireEvent).toHaveBeenCalledWith(
      expect.anything(),
      'message_received',
      {
        friendId: 'f-msg-1',
        eventData: { text: 'hello harness', matched: false },
      },
      'line-access-token',
      null,
    );
  });
});
