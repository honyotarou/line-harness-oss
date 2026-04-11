import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getFriendScenariosDueForDelivery: vi.fn(),
  getScenarioSteps: vi.fn(),
  advanceFriendScenario: vi.fn().mockResolvedValue(undefined),
  completeFriendScenario: vi.fn().mockResolvedValue(undefined),
  getFriendById: vi.fn(),
  jstNow: vi.fn(() => '2026-03-25T10:00:00+09:00'),
}));

vi.mock('@line-crm/db', () => dbMocks);

vi.mock('../../src/services/stealth.js', () => ({
  jitterDeliveryTime: vi.fn((date: Date) => date),
  addJitter: vi.fn(() => 0),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

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
        first: vi.fn().mockResolvedValue(null),
      })),
    })),
  } as unknown as D1Database;
}

describe('processStepDeliveries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T01:00:00.000Z'));
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.advanceFriendScenario.mockResolvedValue(undefined);
    dbMocks.completeFriendScenario.mockResolvedValue(undefined);
    dbMocks.jstNow.mockReturnValue('2026-03-25T10:00:00+09:00');
    reliabilityMocks.beginDeliveryAttempt.mockReset();
    reliabilityMocks.beginDeliveryAttempt.mockResolvedValue(true);
    reliabilityMocks.markDeliveryAttemptSucceeded.mockReset();
    reliabilityMocks.markDeliveryAttemptSucceeded.mockResolvedValue(undefined);
    reliabilityMocks.markDeliveryAttemptFailed.mockReset();
    reliabilityMocks.markDeliveryAttemptFailed.mockResolvedValue(undefined);
  });

  it('marks successful step deliveries as completed operations', async () => {
    dbMocks.getFriendScenariosDueForDelivery.mockResolvedValue([
      {
        id: 'friend-scenario-1',
        friend_id: 'friend-1',
        scenario_id: 'scenario-1',
        current_step_order: 0,
        status: 'active',
        next_delivery_at: '2026-03-25T10:00:00+09:00',
      },
    ]);
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'line-user-1',
      display_name: 'Alice',
      user_id: 'user-1',
      ref_code: null,
      is_following: 1,
      metadata: '{}',
      line_account_id: 'account-1',
    });
    dbMocks.getScenarioSteps.mockResolvedValue([
      {
        id: 'step-1',
        step_order: 1,
        delay_minutes: 0,
        message_type: 'text',
        message_content: 'hello',
        condition_type: null,
        condition_value: null,
        next_step_on_false: null,
      },
    ]);

    const { processStepDeliveries } = await import('../../src/services/step-delivery.js');
    const db = createDb();
    const lineClient = { pushMessage: vi.fn().mockResolvedValue(undefined) };

    await processStepDeliveries(db, lineClient as never, 'https://worker.example.com', 'account-1');

    expect(reliabilityMocks.beginDeliveryAttempt).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        jobName: 'step_deliveries',
        sourceId: 'friend-scenario-1',
        friendId: 'friend-1',
        lineAccountId: 'account-1',
      }),
    );
    expect(reliabilityMocks.markDeliveryAttemptSucceeded).toHaveBeenCalled();
  });

  it('records failed step deliveries for retry instead of advancing the scenario', async () => {
    dbMocks.getFriendScenariosDueForDelivery.mockResolvedValue([
      {
        id: 'friend-scenario-1',
        friend_id: 'friend-1',
        scenario_id: 'scenario-1',
        current_step_order: 0,
        status: 'active',
        next_delivery_at: '2026-03-25T10:00:00+09:00',
      },
    ]);
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'line-user-1',
      display_name: 'Alice',
      user_id: 'user-1',
      ref_code: null,
      is_following: 1,
      metadata: '{}',
      line_account_id: 'account-1',
    });
    dbMocks.getScenarioSteps.mockResolvedValue([
      {
        id: 'step-1',
        step_order: 1,
        delay_minutes: 0,
        message_type: 'text',
        message_content: 'hello',
        condition_type: null,
        condition_value: null,
        next_step_on_false: null,
      },
    ]);

    const { processStepDeliveries } = await import('../../src/services/step-delivery.js');
    const db = createDb();
    const lineClient = { pushMessage: vi.fn().mockRejectedValue(new Error('LINE down')) };

    await processStepDeliveries(db, lineClient as never, 'https://worker.example.com', 'account-1');

    expect(reliabilityMocks.markDeliveryAttemptFailed).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        jobName: 'step_deliveries',
        sourceId: 'friend-scenario-1',
        friendId: 'friend-1',
        lineAccountId: 'account-1',
      }),
      undefined,
    );
    expect(dbMocks.advanceFriendScenario).not.toHaveBeenCalled();
  });

  it('treats corrupt friend metadata as empty when reading preferred delivery hour', async () => {
    dbMocks.getFriendScenariosDueForDelivery.mockResolvedValue([
      {
        id: 'friend-scenario-1',
        friend_id: 'friend-1',
        scenario_id: 'scenario-1',
        current_step_order: 0,
        status: 'active',
        next_delivery_at: '2026-03-25T10:00:00+09:00',
      },
    ]);
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'line-user-1',
      display_name: 'Alice',
      user_id: 'user-1',
      ref_code: null,
      is_following: 1,
      metadata: '{bad-json',
      line_account_id: 'account-1',
    });
    dbMocks.getScenarioSteps.mockResolvedValue([
      {
        id: 'step-1',
        step_order: 1,
        delay_minutes: 0,
        message_type: 'text',
        message_content: 'hello',
        condition_type: null,
        condition_value: null,
        next_step_on_false: null,
      },
    ]);

    const { processStepDeliveries } = await import('../../src/services/step-delivery.js');
    const db = createDb();
    const lineClient = { pushMessage: vi.fn().mockResolvedValue(undefined) };

    await processStepDeliveries(db, lineClient as never, 'https://worker.example.com', 'account-1');

    expect(lineClient.pushMessage).toHaveBeenCalled();
    expect(reliabilityMocks.markDeliveryAttemptSucceeded).toHaveBeenCalled();
  });
});
