import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getDueReminderDeliveriesByAccount: vi.fn(),
  markReminderStepDelivered: vi.fn().mockResolvedValue(undefined),
  completeReminderIfDone: vi.fn().mockResolvedValue(undefined),
  getFriendById: vi.fn(),
  jstNow: vi.fn(() => '2026-03-25T10:00:00+09:00'),
}));

vi.mock('@line-crm/db', () => dbMocks);

const reliabilityMocks = vi.hoisted(() => ({
  beginDeliveryAttempt: vi.fn().mockResolvedValue(true),
  markDeliveryAttemptSucceeded: vi.fn().mockResolvedValue(undefined),
  markDeliveryAttemptFailed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/delivery-reliability.js', () => reliabilityMocks);

function createDb() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  } as unknown as D1Database;
}

describe('processReminderDeliveries', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.markReminderStepDelivered.mockResolvedValue(undefined);
    dbMocks.completeReminderIfDone.mockResolvedValue(undefined);
    dbMocks.jstNow.mockReturnValue('2026-03-25T10:00:00+09:00');
    Object.values(reliabilityMocks).forEach((mockFn) => mockFn.mockReset());
    reliabilityMocks.beginDeliveryAttempt.mockResolvedValue(true);
    reliabilityMocks.markDeliveryAttemptSucceeded.mockResolvedValue(undefined);
    reliabilityMocks.markDeliveryAttemptFailed.mockResolvedValue(undefined);
  });

  it('delivers due reminder steps, logs them, and marks them as sent', async () => {
    dbMocks.getDueReminderDeliveriesByAccount.mockResolvedValue([
      {
        id: 'friend-reminder-1',
        friend_id: 'friend-1',
        reminder_id: 'reminder-1',
        steps: [
          { id: 'step-1', message_type: 'text', message_content: 'hello' },
          {
            id: 'step-2',
            message_type: 'image',
            message_content: JSON.stringify({
              originalContentUrl: 'https://example.com/original.png',
              previewImageUrl: 'https://example.com/preview.png',
            }),
          },
          {
            id: 'step-3',
            message_type: 'flex',
            message_content: '{"type":"bubble","body":{"contents":[]}}',
          },
        ],
      },
    ]);
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'line-user-1',
      is_following: 1,
    });

    const { processReminderDeliveries } = await import('../../src/services/reminder-delivery.js');
    const db = createDb();
    const lineClient = { pushMessage: vi.fn().mockResolvedValue(undefined) };

    await processReminderDeliveries(db, lineClient as never, 'account-1');

    expect(dbMocks.getDueReminderDeliveriesByAccount).toHaveBeenCalledWith(
      db,
      '2026-03-25T10:00:00+09:00',
      'account-1',
    );
    expect(lineClient.pushMessage).toHaveBeenCalledTimes(3);
    expect(dbMocks.markReminderStepDelivered).toHaveBeenCalledTimes(3);
    expect(dbMocks.completeReminderIfDone).toHaveBeenCalledWith(
      db,
      'friend-reminder-1',
      'reminder-1',
    );
  });

  it('skips reminder deliveries for unfollowed friends', async () => {
    dbMocks.getDueReminderDeliveriesByAccount.mockResolvedValue([
      {
        id: 'friend-reminder-1',
        friend_id: 'friend-1',
        reminder_id: 'reminder-1',
        steps: [{ id: 'step-1', message_type: 'text', message_content: 'hello' }],
      },
    ]);
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'line-user-1',
      is_following: 0,
    });

    const { processReminderDeliveries } = await import('../../src/services/reminder-delivery.js');
    const db = createDb();
    const lineClient = { pushMessage: vi.fn().mockResolvedValue(undefined) };

    await processReminderDeliveries(db, lineClient as never);

    expect(lineClient.pushMessage).not.toHaveBeenCalled();
    expect(dbMocks.markReminderStepDelivered).not.toHaveBeenCalled();
    expect(dbMocks.completeReminderIfDone).not.toHaveBeenCalled();
  });

  it('records delivery failures and leaves the step undelivered when push fails', async () => {
    dbMocks.getDueReminderDeliveriesByAccount.mockResolvedValue([
      {
        id: 'friend-reminder-1',
        friend_id: 'friend-1',
        reminder_id: 'reminder-1',
        steps: [{ id: 'step-1', message_type: 'text', message_content: 'hello' }],
      },
    ]);
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'line-user-1',
      is_following: 1,
      line_account_id: 'account-1',
    });

    const { processReminderDeliveries } = await import('../../src/services/reminder-delivery.js');
    const db = createDb();
    const lineClient = { pushMessage: vi.fn().mockRejectedValue(new Error('LINE down')) };

    await processReminderDeliveries(db, lineClient as never, 'account-1');

    expect(reliabilityMocks.markDeliveryAttemptFailed).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        jobName: 'reminder_deliveries',
        sourceId: 'friend-reminder-1',
        friendId: 'friend-1',
        lineAccountId: 'account-1',
      }),
      undefined,
    );
    expect(dbMocks.markReminderStepDelivered).not.toHaveBeenCalled();
  });

  it('does not push reminders during quiet hours (no night push)', async () => {
    dbMocks.jstNow.mockReturnValue('2026-03-25T23:30:00+09:00');
    dbMocks.getDueReminderDeliveriesByAccount.mockResolvedValue([
      {
        id: 'friend-reminder-1',
        friend_id: 'friend-1',
        reminder_id: 'reminder-1',
        steps: [{ id: 'step-1', message_type: 'text', message_content: 'hello' }],
      },
    ]);
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'line-user-1',
      is_following: 1,
    });

    const { processReminderDeliveries } = await import('../../src/services/reminder-delivery.js');
    const db = createDb();
    const lineClient = { pushMessage: vi.fn().mockResolvedValue(undefined) };

    await processReminderDeliveries(db, lineClient as never, 'account-1');

    expect(lineClient.pushMessage).not.toHaveBeenCalled();
    expect(dbMocks.markReminderStepDelivered).not.toHaveBeenCalled();
    expect(dbMocks.completeReminderIfDone).not.toHaveBeenCalled();
  });
});
