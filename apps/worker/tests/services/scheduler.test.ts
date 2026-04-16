import { describe, expect, it, vi } from 'vitest';
import { runScheduledJobs, runWithConcurrencyLimit } from '../../src/services/scheduler.js';

function createFakeLineClient(token: string): { readonly token: string } {
  return { token };
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
        LineClient: createFakeLineClient as unknown as new (
          token: string,
        ) => { readonly token: string },
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
      undefined,
      undefined,
    );
    expect(processStepDeliveries).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ token: 'shared-token' }),
      'https://worker.example.com',
      'account-1',
      undefined,
      undefined,
    );
    expect(processStepDeliveries).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.objectContaining({ token: 'account-2-token' }),
      'https://worker.example.com',
      'account-2',
      undefined,
      undefined,
    );
    expect(processScheduledBroadcasts).toHaveBeenCalledTimes(3);
    expect(processReminderDeliveries).toHaveBeenCalledTimes(3);
    expect(checkAccountHealth).toHaveBeenCalledTimes(1);
    expect(checkAccountHealth).toHaveBeenCalledWith(expect.anything(), undefined);
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
        LineClient: createFakeLineClient as unknown as new (
          token: string,
        ) => { readonly token: string },
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
    expect(checkAccountHealth).toHaveBeenCalledWith(expect.anything(), undefined);
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

  it('logs when admin_session_revocations table is missing', async () => {
    const processStepDeliveries = vi.fn().mockResolvedValue(undefined);
    const processScheduledBroadcasts = vi.fn().mockResolvedValue(undefined);
    const processReminderDeliveries = vi.fn().mockResolvedValue(undefined);
    const checkAccountHealth = vi.fn().mockResolvedValue(undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const db = {
      prepare(sql: string) {
        if (sql.includes('sqlite_master') && sql.includes('admin_session_revocations')) {
          return { first: async () => null };
        }
        return {
          bind: () => ({
            first: async () => null,
            run: async () => ({ success: true }),
          }),
        };
      },
    } as unknown as D1Database;

    await runScheduledJobs(
      {
        db,
        defaultAccessToken: 'shared-token',
        workerUrl: 'https://worker.example.com',
        dbAccounts: [],
      },
      {
        LineClient: createFakeLineClient as unknown as new (
          token: string,
        ) => { readonly token: string },
        processStepDeliveries,
        processScheduledBroadcasts,
        processReminderDeliveries,
        checkAccountHealth,
      },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/admin_session_revocations is missing/),
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
