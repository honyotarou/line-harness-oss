import { LineClient } from '@line-crm/line-sdk';
import { processStepDeliveries } from './step-delivery.js';
import { processScheduledBroadcasts } from './broadcast.js';
import { processReminderDeliveries } from './reminder-delivery.js';
import { checkAccountHealth } from './ban-monitor.js';

interface ActiveAccount {
  id: string;
  is_active: number;
  channel_access_token: string;
}

interface SchedulerParams {
  db: D1Database;
  defaultAccessToken: string;
  workerUrl?: string;
  dbAccounts: ActiveAccount[];
}

interface SchedulerDeps {
  LineClient: typeof LineClient;
  processStepDeliveries: typeof processStepDeliveries;
  processScheduledBroadcasts: typeof processScheduledBroadcasts;
  processReminderDeliveries: typeof processReminderDeliveries;
  checkAccountHealth: typeof checkAccountHealth;
}

const defaultDeps: SchedulerDeps = {
  LineClient,
  processStepDeliveries,
  processScheduledBroadcasts,
  processReminderDeliveries,
  checkAccountHealth,
};

const ACCOUNT_CONCURRENCY_LIMIT = 2;

export function buildScheduledAccountTargets(
  defaultAccessToken: string,
  dbAccounts: ActiveAccount[],
): Array<{ lineAccountId: string | null; accessToken: string }> {
  return [
    { lineAccountId: null, accessToken: defaultAccessToken },
    ...dbAccounts
      .filter((account) => Boolean(account.is_active))
      .map((account) => ({
        lineAccountId: account.id,
        accessToken: account.channel_access_token,
      })),
  ];
}

export async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  if (limit < 1) {
    throw new Error('Concurrency limit must be at least 1');
  }

  if (tasks.length === 0) {
    return [];
  }

  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const taskIndex = nextIndex;
      nextIndex += 1;

      if (taskIndex >= tasks.length) {
        return;
      }

      results[taskIndex] = await tasks[taskIndex]();
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
  );

  return results;
}

async function runScheduledJob(
  job: 'step_deliveries' | 'scheduled_broadcasts' | 'reminder_deliveries',
  lineAccountId: string | null,
  task: () => Promise<unknown>,
): Promise<void> {
  try {
    await task();
  } catch (err) {
    console.error(
      'Scheduled job failed:',
      { job, lineAccountId },
      err,
    );
  }
}

async function runJobsForTarget(
  params: SchedulerParams,
  deps: SchedulerDeps,
  target: { lineAccountId: string | null; accessToken: string },
): Promise<void> {
  const lineClient = new deps.LineClient(target.accessToken);

  await Promise.all([
    runScheduledJob(
      'step_deliveries',
      target.lineAccountId,
      () => deps.processStepDeliveries(
        params.db,
        lineClient,
        params.workerUrl,
        target.lineAccountId,
      ),
    ),
    runScheduledJob(
      'scheduled_broadcasts',
      target.lineAccountId,
      () => deps.processScheduledBroadcasts(
        params.db,
        lineClient,
        target.lineAccountId,
      ),
    ),
    runScheduledJob(
      'reminder_deliveries',
      target.lineAccountId,
      () => deps.processReminderDeliveries(
        params.db,
        lineClient,
        target.lineAccountId,
      ),
    ),
  ]);
}

export async function runScheduledJobs(
  params: SchedulerParams,
  deps: SchedulerDeps = defaultDeps,
): Promise<void> {
  const targets = buildScheduledAccountTargets(
    params.defaultAccessToken,
    params.dbAccounts,
  );
  const targetTasks = targets.map(
    (target) => () => runJobsForTarget(params, deps, target),
  );

  await Promise.all([
    runWithConcurrencyLimit(targetTasks, ACCOUNT_CONCURRENCY_LIMIT),
    deps.checkAccountHealth(params.db),
  ]);
}
