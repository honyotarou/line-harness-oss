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
    conditions: '{}',
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
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
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
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect((init.headers as Record<string, string>)['X-Webhook-Signature']).toMatch(
      /^[0-9a-f]{64}$/,
    );
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
});
