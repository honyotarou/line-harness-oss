import type { LineAccountDbOptions } from '@line-crm/db';
import { hasAdminSessionRevocationsTable } from '@line-crm/db';
import { createLineClient } from '@line-crm/line-sdk';
import { processStepDeliveries } from './step-delivery.js';
import { processScheduledBroadcasts } from './broadcast.js';
import { processReminderDeliveries } from './reminder-delivery.js';
import { checkAccountHealth } from './ban-monitor.js';

type ActiveAccount = Readonly<{
  id: string;
  is_active: number;
  channel_access_token: string;
}>;

type SchedulerParams = Readonly<{
  db: D1Database;
  defaultAccessToken: string;
  workerUrl?: string;
  /** Default bot `channel_id` for auth URL expansion when a friend has no `line_account_id`. */
  defaultLineChannelId?: string;
  dbAccounts: ActiveAccount[];
  lineAccountDbOptions?: LineAccountDbOptions;
}>;

type SchedulerDeps = Readonly<{
  createLineClient: typeof createLineClient;
  processStepDeliveries: typeof processStepDeliveries;
  processScheduledBroadcasts: typeof processScheduledBroadcasts;
  processReminderDeliveries: typeof processReminderDeliveries;
  checkAccountHealth: typeof checkAccountHealth;
}>;

const defaultDeps: SchedulerDeps = {
  createLineClient,
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

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));

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
    console.error('Scheduled job failed:', { job, lineAccountId }, err);
  }
}

async function runJobsForTarget(
  params: SchedulerParams,
  deps: SchedulerDeps,
  target: { lineAccountId: string | null; accessToken: string },
): Promise<void> {
  const lineClient = deps.createLineClient(target.accessToken);

  await Promise.all([
    runScheduledJob('step_deliveries', target.lineAccountId, () =>
      deps.processStepDeliveries(
        params.db,
        lineClient,
        params.workerUrl,
        target.lineAccountId,
        params.defaultLineChannelId,
        params.lineAccountDbOptions,
      ),
    ),
    runScheduledJob('scheduled_broadcasts', target.lineAccountId, () =>
      deps.processScheduledBroadcasts(params.db, lineClient, target.lineAccountId),
    ),
    runScheduledJob('reminder_deliveries', target.lineAccountId, () =>
      deps.processReminderDeliveries(params.db, lineClient, target.lineAccountId),
    ),
  ]);
}

export async function runScheduledJobs(
  params: SchedulerParams,
  deps: SchedulerDeps = defaultDeps,
): Promise<void> {
  if (params.db && typeof params.db.prepare === 'function') {
    try {
      if (!(await hasAdminSessionRevocationsTable(params.db))) {
        console.error(
          'D1 schema: table admin_session_revocations is missing; apply packages/db/migrations/015_admin_session_revocations.sql (e.g. pnpm db:apply-015:local or pnpm db:apply-015:remote). Until then, admin logout/session revocation may not work as intended.',
        );
      }
    } catch (err) {
      console.error('D1 admin_session_revocations table check failed:', err);
    }
  }

  const targets = buildScheduledAccountTargets(params.defaultAccessToken, params.dbAccounts);
  const targetTasks = targets.map((target) => () => runJobsForTarget(params, deps, target));

  await Promise.all([
    runWithConcurrencyLimit(targetTasks, ACCOUNT_CONCURRENCY_LIMIT),
    deps.checkAccountHealth(params.db, params.lineAccountDbOptions),
  ]);
}
