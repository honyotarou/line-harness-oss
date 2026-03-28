import { describe, expect, it, vi } from 'vitest';
import { runScheduledJobs, runWithConcurrencyLimit } from '../../src/services/scheduler.js';

class FakeLineClient {
  constructor(public readonly token: string) {}
}

describe('runScheduledJobs', () => {
  it('runs each scheduled job for the default account and every active db account', async () => {
    const processStepDeliveries = vi.fn().mockResolvedValue(undefined);
    const processScheduledBroadcasts = vi.fn().mockResolvedValue(undefined);
    const processReminderDeliveries = vi.fn().mockResolvedValue(undefined);
    const checkAccountHealth = vi.fn().mockResolvedValue(undefined);

    await runScheduledJobs(
      {
        db: {} as D1Database,
        defaultAccessToken: 'shared-token',
        workerUrl: 'https://worker.example.com',
        dbAccounts: [
          { id: 'account-1', is_active: 1, channel_access_token: 'shared-token' },
          { id: 'account-2', is_active: 1, channel_access_token: 'account-2-token' },
          { id: 'account-3', is_active: 0, channel_access_token: 'inactive-token' },
        ],
      },
      {
        LineClient: FakeLineClient,
        processStepDeliveries,
        processScheduledBroadcasts,
        processReminderDeliveries,
        checkAccountHealth,
      },
    );

    expect(processStepDeliveries).toHaveBeenCalledTimes(3);
    expect(processStepDeliveries).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ token: 'shared-token' }),
      'https://worker.example.com',
      null,
    );
    expect(processStepDeliveries).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ token: 'shared-token' }),
      'https://worker.example.com',
      'account-1',
    );
    expect(processStepDeliveries).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.objectContaining({ token: 'account-2-token' }),
      'https://worker.example.com',
      'account-2',
    );
    expect(processScheduledBroadcasts).toHaveBeenCalledTimes(3);
    expect(processReminderDeliveries).toHaveBeenCalledTimes(3);
    expect(checkAccountHealth).toHaveBeenCalledTimes(1);
  });

  it('logs named job failures without aborting the remaining scheduled work', async () => {
    const processStepDeliveries = vi.fn().mockResolvedValue(undefined);
    const processScheduledBroadcasts = vi
      .fn()
      .mockRejectedValueOnce(new Error('broadcast failed'))
      .mockResolvedValue(undefined);
    const processReminderDeliveries = vi.fn().mockResolvedValue(undefined);
    const checkAccountHealth = vi.fn().mockResolvedValue(undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runScheduledJobs(
      {
        db: {} as D1Database,
        defaultAccessToken: 'shared-token',
        workerUrl: 'https://worker.example.com',
        dbAccounts: [{ id: 'account-1', is_active: 1, channel_access_token: 'account-1-token' }],
      },
      {
        LineClient: FakeLineClient,
        processStepDeliveries,
        processScheduledBroadcasts,
        processReminderDeliveries,
        checkAccountHealth,
      },
    );

    expect(processStepDeliveries).toHaveBeenCalledTimes(2);
    expect(processScheduledBroadcasts).toHaveBeenCalledTimes(2);
    expect(processReminderDeliveries).toHaveBeenCalledTimes(2);
    expect(checkAccountHealth).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Scheduled job failed:',
      expect.objectContaining({
        job: 'scheduled_broadcasts',
        lineAccountId: null,
      }),
      expect.any(Error),
    );

    errorSpy.mockRestore();
  });
});

describe('runWithConcurrencyLimit', () => {
  it('caps the number of in-flight tasks', async () => {
    let active = 0;
    let peak = 0;

    const tasks = Array.from({ length: 5 }, (_, index) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10 + index));
      active -= 1;
      return index;
    });

    const results = await runWithConcurrencyLimit(tasks, 2);

    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
