import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getActiveOutgoingWebhooksByEvent: vi.fn(),
  applyScoring: vi.fn(),
  getActiveAutomationsByEvent: vi.fn(),
  createAutomationLog: vi.fn(),
  getActiveNotificationRulesByEvent: vi.fn(),
  createNotification: vi.fn(),
  addTagToFriend: vi.fn(),
  removeTagFromFriend: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  jstNow: vi.fn(() => '2026-03-26T12:00:00+09:00'),
}));

vi.mock('@line-crm/db', () => dbMocks);

vi.mock('@line-crm/line-sdk', () => ({
  LineClient: vi.fn().mockImplementation(() => ({
    pushMessage: vi.fn().mockResolvedValue(undefined),
    linkRichMenuToUser: vi.fn().mockResolvedValue(undefined),
    unlinkRichMenuFromUser: vi.fn().mockResolvedValue(undefined),
  })),
}));

const emptyDb = {} as D1Database;

function automationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'auto-1',
    name: 'Test',
    description: null,
    event_type: 'friend_add',
    conditions: JSON.stringify({ match_always: true }),
    actions: JSON.stringify([{ type: 'add_tag', params: { tagId: 't1' } }]),
    line_account_id: 'acc-1',
    is_active: 1,
    priority: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('fireEvent', () => {
  beforeEach(() => {
    for (const fn of Object.values(dbMocks)) {
      (fn as ReturnType<typeof vi.fn>).mockClear();
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('cloudflare-dns.com/dns-query')) {
          return new Response(
            JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }),
            { status: 200, headers: { 'Content-Type': 'application/dns-json' } },
          );
        }
        return new Response('', { status: 200, statusText: 'OK' });
      }),
    );
    dbMocks.getActiveOutgoingWebhooksByEvent.mockResolvedValue([]);
    dbMocks.applyScoring.mockResolvedValue(undefined);
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([]);
    dbMocks.createAutomationLog.mockResolvedValue(undefined);
    dbMocks.getActiveNotificationRulesByEvent.mockResolvedValue([]);
    dbMocks.createNotification.mockResolvedValue(undefined);
    dbMocks.addTagToFriend.mockResolvedValue(undefined);
    dbMocks.removeTagFromFriend.mockResolvedValue(undefined);
    dbMocks.enrollFriendInScenario.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs all branches concurrently when hooks return empty', async () => {
    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.getActiveOutgoingWebhooksByEvent).toHaveBeenCalledWith(emptyDb, 'friend_add');
    expect(dbMocks.getActiveAutomationsByEvent).toHaveBeenCalledWith(emptyDb, 'friend_add');
    expect(dbMocks.getActiveNotificationRulesByEvent).toHaveBeenCalledWith(emptyDb, 'friend_add');
  });

  it('applies scoring only when friendId is present (sequential mock usage)', async () => {
    const { fireEvent } = await import('../../src/services/event-bus.js');

    await fireEvent(emptyDb, 'friend_add', {}, 'line-token', 'acc-1');
    expect(dbMocks.applyScoring).not.toHaveBeenCalled();

    vi.clearAllMocks();
    dbMocks.getActiveOutgoingWebhooksByEvent.mockResolvedValue([]);
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([]);
    dbMocks.getActiveNotificationRulesByEvent.mockResolvedValue([]);

    await fireEvent(emptyDb, 'message_received', { friendId: 'f1' }, 'line-token', 'acc-1');
    expect(dbMocks.applyScoring).toHaveBeenCalledWith(emptyDb, 'f1', 'message_received');
  });

  it('POSTs outgoing webhooks and adds HMAC signature when secret is set', async () => {
    dbMocks.getActiveOutgoingWebhooksByEvent.mockResolvedValue([
      {
        id: 'w1',
        name: 'Hook',
        url: 'https://example.com/out',
        event_types: '[]',
        secret: 'webhook-secret',
        is_active: 1,
        created_at: '',
        updated_at: '',
      },
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalled();
    const outCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('example.com/out'));
    expect(outCall).toBeDefined();
    const init = outCall![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect((init.headers as Record<string, string>)['X-Webhook-Signature']).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect((init.headers as Record<string, string>)['X-Webhook-Timestamp']).toMatch(/^[0-9]{10}$/);
  });

  it('executes add_tag automation and logs success', async () => {
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([automationRow()]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.addTagToFriend).toHaveBeenCalledWith(emptyDb, 'f1', 't1');
    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      emptyDb,
      expect.objectContaining({
        automationId: 'auto-1',
        friendId: 'f1',
        status: 'success',
      }),
    );
  });

  it('does not run automation when conditions are an empty object', async () => {
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([automationRow({ conditions: '{}' })]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.addTagToFriend).not.toHaveBeenCalled();
  });

  it('does not run automation when conditions use unknown keys', async () => {
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({ conditions: JSON.stringify({ evil: true }) }),
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.addTagToFriend).not.toHaveBeenCalled();
  });

  it('filters automations by line account and score_threshold', async () => {
    const { fireEvent } = await import('../../src/services/event-bus.js');

    dbMocks.getActiveAutomationsByEvent.mockResolvedValueOnce([
      automationRow({ line_account_id: 'other-account' }),
    ]);
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');
    expect(dbMocks.addTagToFriend).not.toHaveBeenCalled();

    vi.clearAllMocks();
    dbMocks.getActiveOutgoingWebhooksByEvent.mockResolvedValue([]);
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        conditions: JSON.stringify({ score_threshold: 100 }),
        actions: JSON.stringify([{ type: 'add_tag', params: { tagId: 't1' } }]),
      }),
    ]);
    dbMocks.getActiveNotificationRulesByEvent.mockResolvedValue([]);
    dbMocks.createAutomationLog.mockResolvedValue(undefined);

    await fireEvent(emptyDb, 'friend_add', {
      friendId: 'f1',
      eventData: { currentScore: 10 },
    });
    expect(dbMocks.addTagToFriend).not.toHaveBeenCalled();
  });

  it('runs send_webhook without friendId', async () => {
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        actions: JSON.stringify([{ type: 'send_webhook', params: { url: 'https://hook.test/x' } }]),
      }),
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { eventData: { ping: true } }, 'line-token', 'acc-1');

    const fetchMock = vi.mocked(globalThis.fetch);
    const hookCalls = fetchMock.mock.calls.filter((c) => (c[0] as string).includes('hook.test'));
    expect(hookCalls.length).toBeGreaterThanOrEqual(1);
    const sendInit = hookCalls[0][1] as RequestInit;
    expect(sendInit.redirect).toBe('manual');
  });

  it('does not fetch outgoing webhooks when the URL is not an allowed public https target', async () => {
    dbMocks.getActiveOutgoingWebhooksByEvent.mockResolvedValue([
      {
        id: 'w-local',
        name: 'Local',
        url: 'https://127.0.0.1/out',
        event_types: '[]',
        secret: 'unsigned-outbound-placeholder',
        is_active: 1,
        created_at: '',
        updated_at: '',
      },
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    const fetchMock = vi.mocked(globalThis.fetch);
    const toLocal = fetchMock.mock.calls.filter((c) => String(c[0]).includes('127.0.0.1'));
    expect(toLocal.length).toBe(0);
  });

  it('logs automation failure when conditions are valid JSON but not an object', async () => {
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        conditions: '[]',
        actions: '[{"type":"add_tag","params":{"tagId":"t1"}}]',
      }),
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.addTagToFriend).not.toHaveBeenCalled();
    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      emptyDb,
      expect.objectContaining({
        status: 'failed',
        actionsResult: expect.stringContaining('must be a JSON object'),
      }),
    );
  });

  it('caps the number of automations executed per event (DoS guard)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { MAX_AUTOMATIONS_PER_EVENT, MAX_AUTOMATION_TOTAL_ACTIONS_PER_EVENT } = await import(
        '../../src/services/event-bus.js'
      );
      const overCap = MAX_AUTOMATIONS_PER_EVENT + 5;
      dbMocks.getActiveAutomationsByEvent.mockResolvedValue(
        Array.from({ length: overCap }, (_, i) => automationRow({ id: `auto-${i}`, priority: i })),
      );

      const { fireEvent } = await import('../../src/services/event-bus.js');
      await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

      // add_tag is executed at most MAX_AUTOMATIONS_PER_EVENT times
      const expected = Math.min(MAX_AUTOMATIONS_PER_EVENT, MAX_AUTOMATION_TOTAL_ACTIONS_PER_EVENT);
      expect(dbMocks.addTagToFriend).toHaveBeenCalledTimes(expected);
      expect(dbMocks.createAutomationLog).toHaveBeenCalledTimes(MAX_AUTOMATIONS_PER_EVENT);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toMatch(
        new RegExp(
          `processAutomations: truncating ${overCap} automations to ${MAX_AUTOMATIONS_PER_EVENT} for event friend_add`,
        ),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('caps total executed automation actions per event (excessive-agency guard)', async () => {
    const { MAX_AUTOMATION_TOTAL_ACTIONS_PER_EVENT } = await import(
      '../../src/services/event-bus.js'
    );
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue(
      Array.from({ length: MAX_AUTOMATION_TOTAL_ACTIONS_PER_EVENT + 20 }, (_, i) =>
        automationRow({ id: `auto-${i}`, priority: i }),
      ),
    );

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.addTagToFriend).toHaveBeenCalledTimes(MAX_AUTOMATION_TOTAL_ACTIONS_PER_EVENT);
  });

  it('does not warn when automation count is at the per-event cap', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { MAX_AUTOMATIONS_PER_EVENT, fireEvent } = await import(
        '../../src/services/event-bus.js'
      );
      dbMocks.getActiveAutomationsByEvent.mockResolvedValue(
        Array.from({ length: MAX_AUTOMATIONS_PER_EVENT }, (_, i) =>
          automationRow({ id: `auto-${i}`, priority: i }),
        ),
      );

      await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('rejects automations with too many actions (DoS guard)', async () => {
    const { MAX_AUTOMATION_ACTIONS_PER_RULE } = await import('../../src/services/event-bus.js');
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        actions: JSON.stringify(
          Array.from({ length: MAX_AUTOMATION_ACTIONS_PER_RULE + 1 }, () => ({
            type: 'add_tag',
            params: { tagId: 't1' },
          })),
        ),
      }),
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.addTagToFriend).not.toHaveBeenCalled();
    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      emptyDb,
      expect.objectContaining({
        status: 'failed',
        actionsResult: expect.stringContaining('actions must be <='),
      }),
    );
  });

  it('V-4 / P3: set_metadata calls mergeFriendMetadataPatch (not unvalidated merge)', async () => {
    const mergeMod = await import('../../src/services/friend-metadata-merge.js');
    const mergeSpy = vi.spyOn(mergeMod, 'mergeFriendMetadataPatch');

    const runMock = vi.fn().mockResolvedValue({});
    const dbMeta = {
      prepare: vi.fn().mockImplementation((sql: string) => ({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            if (sql.includes('SELECT metadata FROM friends')) {
              return { metadata: '{}' };
            }
            if (sql.includes('SELECT line_user_id FROM friends')) {
              return null;
            }
            return null;
          }),
          run: runMock,
        }),
      })),
    } as unknown as D1Database;

    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        actions: JSON.stringify([
          {
            type: 'set_metadata',
            params: { data: JSON.stringify({ tier: 'pro' }) },
          },
        ]),
      }),
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(dbMeta, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(mergeSpy).toHaveBeenCalled();
    expect(mergeSpy.mock.calls[0]?.[1]).toEqual({ tier: 'pro' });
    mergeSpy.mockRestore();
  });

  it('applies set_metadata when friend metadata in DB is corrupt JSON', async () => {
    const runMock = vi.fn().mockResolvedValue({});
    const dbMeta = {
      prepare: vi.fn().mockImplementation((sql: string) => ({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            if (sql.includes('SELECT metadata FROM friends')) {
              return { metadata: '{bad' };
            }
            if (sql.includes('SELECT line_user_id FROM friends')) {
              return null;
            }
            return null;
          }),
          run: runMock,
        }),
      })),
    } as unknown as D1Database;

    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        actions: JSON.stringify([
          { type: 'set_metadata', params: { data: JSON.stringify({ recovered: true }) } },
        ]),
      }),
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(dbMeta, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      dbMeta,
      expect.objectContaining({ status: 'success' }),
    );
    expect(runMock).toHaveBeenCalled();
  });

  it('logs automation failure when flex send_message content is a JSON array', async () => {
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        actions: JSON.stringify([
          {
            type: 'send_message',
            params: { messageType: 'flex', content: '[]', altText: 'x' },
          },
        ]),
      }),
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      emptyDb,
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('logs automation failure when conditions/actions JSON from DB is invalid', async () => {
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        conditions: '{not-json',
        actions: '[{"type":"add_tag","params":{"tagId":"t1"}}]',
      }),
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.addTagToFriend).not.toHaveBeenCalled();
    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      emptyDb,
      expect.objectContaining({
        automationId: 'auto-1',
        status: 'failed',
        actionsResult: expect.stringContaining('_parse'),
      }),
    );
  });

  it('logs automation failure when set_metadata patch exceeds merge key limit', async () => {
    const patch: Record<string, number> = {};
    for (let i = 0; i < 201; i++) {
      patch[`k${i}`] = 1;
    }
    const runMock = vi.fn().mockResolvedValue({});
    const dbMeta = {
      prepare: vi.fn().mockImplementation((sql: string) => ({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            if (sql.includes('SELECT metadata FROM friends')) {
              return { metadata: '{}' };
            }
            return null;
          }),
          run: runMock,
        }),
      })),
    } as unknown as D1Database;

    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        actions: JSON.stringify([
          { type: 'set_metadata', params: { data: JSON.stringify(patch) } },
        ]),
      }),
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(dbMeta, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      dbMeta,
      expect.objectContaining({
        status: 'failed',
        actionsResult: expect.stringMatching(/200 keys/i),
      }),
    );
    expect(runMock).not.toHaveBeenCalled();
  });

  it('logs automation failure when set_metadata patch is a JSON array not an object', async () => {
    const runMock = vi.fn().mockResolvedValue({});
    const dbMeta = {
      prepare: vi.fn().mockImplementation((sql: string) => ({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            if (sql.includes('SELECT metadata FROM friends')) {
              return { metadata: '{}' };
            }
            return null;
          }),
          run: runMock,
        }),
      })),
    } as unknown as D1Database;

    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        actions: JSON.stringify([{ type: 'set_metadata', params: { data: '[]' } }]),
      }),
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(dbMeta, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      dbMeta,
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('logs automation failure when set_metadata patch JSON is invalid', async () => {
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        actions: JSON.stringify([{ type: 'set_metadata', params: { data: '{bad' } }]),
      }),
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      emptyDb,
      expect.objectContaining({
        status: 'failed',
      }),
    );
  });

  /**
   * Cycle 5 — Attacker view: poison automation flex JSON → uncaught exception / unstable worker.
   */
  it('logs automation failure when flex message content is invalid JSON', async () => {
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        actions: JSON.stringify([
          {
            type: 'send_message',
            params: { messageType: 'flex', content: '{not-json', altText: 'x' },
          },
        ]),
      }),
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      emptyDb,
      expect.objectContaining({
        status: 'failed',
      }),
    );
  });

  it('logs automation failure when send_webhook is blocked by empty host allowlist with REQUIRE flag', async () => {
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        actions: JSON.stringify([
          { type: 'send_webhook', params: { url: 'https://hooks.slack.com/services/X/Y/Z' } },
        ]),
      }),
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1', {
      requireAutomationSendWebhookHostAllowlist: true,
    });

    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      emptyDb,
      expect.objectContaining({
        status: 'failed',
        actionsResult: expect.stringMatching(/AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS/i),
      }),
    );
  });

  it('logs automation failure when send_webhook URL is blocked', async () => {
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        actions: JSON.stringify([
          { type: 'send_webhook', params: { url: 'https://192.168.0.1/internal' } },
        ]),
      }),
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      emptyDb,
      expect.objectContaining({
        status: 'failed',
      }),
    );
  });

  it('logs automation failure when send_webhook host is outside AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS', async () => {
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        actions: JSON.stringify([
          { type: 'send_webhook', params: { url: 'https://example.com/hook' } },
        ]),
      }),
    ]);

    const fetchMock = vi.mocked(globalThis.fetch);
    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1', {
      automationSendWebhookAllowedHosts: 'hooks.slack.com',
    });

    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      emptyDb,
      expect.objectContaining({
        status: 'failed',
        actionsResult: expect.stringMatching(/host not allowed/i),
      }),
    );
    const postCalls = fetchMock.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).startsWith('https://example.com'),
    );
    expect(postCalls.length).toBe(0);
  });

  it('does not POST send_webhook when suppressAutomationSendWebhook is set', async () => {
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        actions: JSON.stringify([
          { type: 'send_webhook', params: { url: 'https://hooks.slack.com/services/X/Y/Z' } },
        ]),
      }),
    ]);

    const fetchMock = vi.mocked(globalThis.fetch);
    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1', {
      suppressAutomationSendWebhook: true,
    });

    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      emptyDb,
      expect.objectContaining({
        status: 'failed',
        actionsResult: expect.stringMatching(/incoming webhooks/i),
      }),
    );
    const slackPosts = fetchMock.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('hooks.slack.com'),
    );
    expect(slackPosts.length).toBe(0);
  });

  it('allows send_webhook when host matches AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS', async () => {
    dbMocks.getActiveAutomationsByEvent.mockResolvedValue([
      automationRow({
        actions: JSON.stringify([
          { type: 'send_webhook', params: { url: 'https://hooks.slack.com/services/XXX/YYY/ZZZ' } },
        ]),
      }),
    ]);

    const fetchMock = vi.mocked(globalThis.fetch);
    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1', {
      automationSendWebhookAllowedHosts: '.slack.com',
    });

    expect(dbMocks.createAutomationLog).toHaveBeenCalledWith(
      emptyDb,
      expect.objectContaining({ status: 'success' }),
    );
    const slackPosts = fetchMock.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('hooks.slack.com'),
    );
    expect(slackPosts.length).toBeGreaterThan(0);
  });

  it('creates notifications for matching rules', async () => {
    dbMocks.getActiveNotificationRulesByEvent.mockResolvedValue([
      {
        id: 'rule-1',
        name: 'Alert',
        event_type: 'friend_add',
        conditions: '{}',
        channels: JSON.stringify(['dashboard']),
        line_account_id: 'acc-1',
        is_active: 1,
        created_at: '',
        updated_at: '',
      },
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.createNotification).toHaveBeenCalledWith(
      emptyDb,
      expect.objectContaining({
        ruleId: 'rule-1',
        channel: 'dashboard',
        lineAccountId: 'acc-1',
      }),
    );
  });

  it('skips notification rules when channels JSON in DB is invalid', async () => {
    dbMocks.getActiveNotificationRulesByEvent.mockResolvedValue([
      {
        id: 'rule-bad',
        name: 'Bad channels',
        event_type: 'friend_add',
        conditions: '{}',
        channels: '{{{',
        line_account_id: 'acc-1',
        is_active: 1,
        created_at: '',
        updated_at: '',
      },
    ]);

    const { fireEvent } = await import('../../src/services/event-bus.js');
    await fireEvent(emptyDb, 'friend_add', { friendId: 'f1' }, 'line-token', 'acc-1');

    expect(dbMocks.createNotification).not.toHaveBeenCalled();
  });
});
