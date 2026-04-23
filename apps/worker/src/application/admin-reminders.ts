import {
  createReminder,
  createReminderStep,
  deleteReminder,
  deleteReminderStep,
  enrollFriendInReminder,
  getFriendById,
  getFriendReminders,
  getReminderById,
  getReminders,
  getReminderSteps,
  updateReminder,
  cancelFriendReminder,
} from '@line-crm/db';
import type {
  Friend as DbFriend,
  FriendReminderRow,
  ReminderRow,
  ReminderStepRow,
} from '@line-crm/db';
import type { LineAccountScope } from '../services/admin-line-account-scope.js';
import {
  jsonBodyForLineAccountScopeFailure,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountBody,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';

type ReminderId = string & { readonly __brand: 'ReminderId' };
type ReminderStepId = string & { readonly __brand: 'ReminderStepId' };
type FriendId = string & { readonly __brand: 'FriendId' };
type FriendReminderId = string & { readonly __brand: 'FriendReminderId' };
type LineAccountId = string & { readonly __brand: 'LineAccountId' };

export type SerializedReminder = Readonly<{
  id: ReminderId;
  name: string;
  description: string | null;
  isActive: boolean;
  lineAccountId: LineAccountId | null;
  createdAt: string;
  updatedAt: string;
}>;

export type SerializedReminderStep = Readonly<{
  id: ReminderStepId;
  reminderId: ReminderId;
  offsetMinutes: number;
  messageType: string;
  messageContent: string;
  createdAt: string;
}>;

export type SerializedFriendReminder = Readonly<{
  id: FriendReminderId;
  friendId: FriendId;
  reminderId: ReminderId;
  targetDate: string;
  status: string;
  createdAt: string;
}>;

export type ReminderDetail = Readonly<{
  id: ReminderId;
  name: string;
  description: string | null;
  isActive: boolean;
  lineAccountId: LineAccountId | null;
  createdAt: string;
  updatedAt: string;
  steps: readonly SerializedReminderStep[];
}>;

export type CreateAdminReminderBody = Readonly<{
  name: string;
  description?: string;
  lineAccountId?: string | null;
}>;

export type UpdateAdminReminderBody = Readonly<Record<string, unknown>>;

export type CreateAdminReminderStepBody = Readonly<{
  offsetMinutes: number;
  messageType: string;
  messageContent: string;
}>;

export type EnrollAdminReminderBody = Readonly<{
  targetDate: string;
}>;

type ReminderFailure = Readonly<{ ok: false; status: 400 | 403 | 404; body: unknown }>;

function reminderIdFromStorage(id: string): ReminderId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('reminderId required');
  }
  return id.trim() as ReminderId;
}

function reminderStepIdFromStorage(id: string): ReminderStepId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('reminderStepId required');
  }
  return id.trim() as ReminderStepId;
}

function friendIdFromStorage(id: string): FriendId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('friendId required');
  }
  return id.trim() as FriendId;
}

function friendReminderIdFromStorage(id: string): FriendReminderId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('friendReminderId required');
  }
  return id.trim() as FriendReminderId;
}

function lineAccountIdFromNullable(raw: string | null | undefined): LineAccountId | null {
  if (raw == null) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : (trimmed as LineAccountId);
}

function serializeReminder(row: ReminderRow): SerializedReminder {
  return {
    id: reminderIdFromStorage(row.id),
    name: row.name,
    description: row.description,
    isActive: Boolean(row.is_active),
    lineAccountId: lineAccountIdFromNullable(row.line_account_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeReminderStep(row: ReminderStepRow): SerializedReminderStep {
  return {
    id: reminderStepIdFromStorage(row.id),
    reminderId: reminderIdFromStorage(row.reminder_id),
    offsetMinutes: row.offset_minutes,
    messageType: row.message_type,
    messageContent: row.message_content,
    createdAt: row.created_at,
  };
}

function serializeFriendReminder(row: FriendReminderRow): SerializedFriendReminder {
  return {
    id: friendReminderIdFromStorage(row.id),
    friendId: friendIdFromStorage(row.friend_id),
    reminderId: reminderIdFromStorage(row.reminder_id),
    targetDate: row.target_date,
    status: row.status,
    createdAt: row.created_at,
  };
}

function reminderNotFoundFailure(message: string): ReminderFailure {
  return { ok: false, status: 404, body: { success: false, error: message } };
}

function friendNotFoundFailure(): ReminderFailure {
  return { ok: false, status: 404, body: { success: false, error: 'Friend not found' } };
}

async function getScopedReminder(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
  message: string,
): Promise<Readonly<{ ok: true; data: ReminderRow }> | ReminderFailure> {
  const reminder = await getReminderById(db, id);
  if (!reminder) {
    return reminderNotFoundFailure(message);
  }
  if (!resourceLineAccountVisibleInScope(scope, reminder.line_account_id)) {
    return reminderNotFoundFailure(message);
  }
  return { ok: true, data: reminder };
}

async function getScopedFriend(
  db: D1Database,
  scope: LineAccountScope,
  friendId: string,
): Promise<Readonly<{ ok: true; data: DbFriend }> | ReminderFailure> {
  const friend = await getFriendById(db, friendId);
  if (!friend) {
    return friendNotFoundFailure();
  }
  if (!resourceLineAccountVisibleInScope(scope, friend.line_account_id)) {
    return friendNotFoundFailure();
  }
  return { ok: true, data: friend };
}

export async function listAdminReminders(
  db: D1Database,
  scope: LineAccountScope,
  requestedLineAccountId: string | undefined,
): Promise<Readonly<{ ok: true; data: readonly SerializedReminder[] }> | ReminderFailure> {
  const q = validateScopedLineAccountQueryParam(scope, requestedLineAccountId);
  if (!q.ok) {
    return { ok: false, status: q.status, body: jsonBodyForLineAccountScopeFailure(q) };
  }

  const normalizedLineAccountId = requestedLineAccountId?.trim();
  const items =
    normalizedLineAccountId && normalizedLineAccountId.length > 0
      ? (
          await db
            .prepare(`SELECT * FROM reminders WHERE line_account_id = ? ORDER BY created_at DESC`)
            .bind(normalizedLineAccountId)
            .all<ReminderRow>()
        ).results
      : await getReminders(db);

  return { ok: true, data: items.map(serializeReminder) };
}

export async function getAdminReminder(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
): Promise<Readonly<{ ok: true; data: ReminderDetail }> | ReminderFailure> {
  const scoped = await getScopedReminder(db, scope, id, 'Reminder not found');
  if (!scoped.ok) {
    return scoped;
  }

  const steps = await getReminderSteps(db, id);
  return {
    ok: true,
    data: {
      ...serializeReminder(scoped.data),
      steps: steps.map(serializeReminderStep),
    },
  };
}

export async function createAdminReminder(
  db: D1Database,
  scope: LineAccountScope,
  body: CreateAdminReminderBody,
): Promise<
  | Readonly<{
      ok: true;
      data: Readonly<{
        id: ReminderId;
        name: string;
        lineAccountId: LineAccountId | null;
        createdAt: string;
      }>;
    }>
  | ReminderFailure
> {
  if (!body.name) {
    return { ok: false, status: 400, body: { success: false, error: 'name is required' } };
  }

  const scopedLineAccount = validateScopedLineAccountBody(scope, body.lineAccountId ?? null);
  if (!scopedLineAccount.ok) {
    return {
      ok: false,
      status: scopedLineAccount.status,
      body: jsonBodyForLineAccountScopeFailure(scopedLineAccount),
    };
  }

  const item = await createReminder(db, {
    name: body.name,
    description: body.description,
    lineAccountId: scopedLineAccount.lineAccountId,
  });

  return {
    ok: true,
    data: {
      id: reminderIdFromStorage(item.id),
      name: item.name,
      lineAccountId: lineAccountIdFromNullable(item.line_account_id),
      createdAt: item.created_at,
    },
  };
}

export async function updateAdminReminder(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
  body: UpdateAdminReminderBody,
): Promise<
  | Readonly<{
      ok: true;
      data: Readonly<{
        id: ReminderId;
        name: string;
        isActive: boolean;
        lineAccountId: LineAccountId | null;
      }>;
    }>
  | ReminderFailure
> {
  const scoped = await getScopedReminder(db, scope, id, 'Not found');
  if (!scoped.ok) {
    return scoped;
  }

  const patch: Record<string, unknown> = { ...body };
  if (patch.lineAccountId !== undefined || patch.line_account_id !== undefined) {
    const rawLineAccountId = patch.lineAccountId ?? patch.line_account_id;
    const scopedLineAccount = validateScopedLineAccountBody(
      scope,
      rawLineAccountId === null
        ? null
        : typeof rawLineAccountId === 'string'
          ? rawLineAccountId
          : null,
    );
    if (!scopedLineAccount.ok) {
      return {
        ok: false,
        status: scopedLineAccount.status,
        body: jsonBodyForLineAccountScopeFailure(scopedLineAccount),
      };
    }
    patch.lineAccountId = scopedLineAccount.lineAccountId;
  }

  await updateReminder(db, id, patch as never);
  const updated = await getReminderById(db, id);
  if (!updated) {
    return reminderNotFoundFailure('Not found');
  }

  return {
    ok: true,
    data: {
      id: reminderIdFromStorage(updated.id),
      name: updated.name,
      isActive: Boolean(updated.is_active),
      lineAccountId: lineAccountIdFromNullable(updated.line_account_id),
    },
  };
}

export async function deleteAdminReminder(
  db: D1Database,
  scope: LineAccountScope,
  id: string,
): Promise<Readonly<{ ok: true; data: null }> | ReminderFailure> {
  const scoped = await getScopedReminder(db, scope, id, 'Not found');
  if (!scoped.ok) {
    return scoped;
  }

  await deleteReminder(db, id);
  return { ok: true, data: null };
}

export async function createAdminReminderStep(
  db: D1Database,
  scope: LineAccountScope,
  reminderId: string,
  body: CreateAdminReminderStepBody,
): Promise<
  | Readonly<{
      ok: true;
      data: Readonly<{
        id: ReminderStepId;
        reminderId: ReminderId;
        offsetMinutes: number;
        messageType: string;
        createdAt: string;
      }>;
    }>
  | ReminderFailure
> {
  const scoped = await getScopedReminder(db, scope, reminderId, 'Reminder not found');
  if (!scoped.ok) {
    return scoped;
  }

  if (body.offsetMinutes === undefined || !body.messageType || !body.messageContent) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: 'offsetMinutes, messageType, messageContent are required',
      },
    };
  }

  const step = await createReminderStep(db, { reminderId, ...body });
  return {
    ok: true,
    data: {
      id: reminderStepIdFromStorage(step.id),
      reminderId: reminderIdFromStorage(step.reminder_id),
      offsetMinutes: step.offset_minutes,
      messageType: step.message_type,
      createdAt: step.created_at,
    },
  };
}

export async function deleteAdminReminderStep(
  db: D1Database,
  scope: LineAccountScope,
  reminderId: string,
  stepId: string,
): Promise<Readonly<{ ok: true; data: null }> | ReminderFailure> {
  const scoped = await getScopedReminder(db, scope, reminderId, 'Not found');
  if (!scoped.ok) {
    return scoped;
  }

  const stepRow = await db
    .prepare(`SELECT id FROM reminder_steps WHERE id = ? AND reminder_id = ?`)
    .bind(stepId, reminderId)
    .first<{ id: string }>();
  if (!stepRow) {
    return reminderNotFoundFailure('Not found');
  }

  await deleteReminderStep(db, stepId);
  return { ok: true, data: null };
}

export async function enrollFriendInAdminReminder(
  db: D1Database,
  scope: LineAccountScope,
  reminderId: string,
  friendId: string,
  body: EnrollAdminReminderBody,
): Promise<
  | Readonly<{
      ok: true;
      data: Readonly<{
        id: FriendReminderId;
        friendId: FriendId;
        reminderId: ReminderId;
        targetDate: string;
        status: string;
      }>;
    }>
  | ReminderFailure
> {
  const scopedReminder = await getScopedReminder(db, scope, reminderId, 'Reminder not found');
  if (!scopedReminder.ok) {
    return scopedReminder;
  }

  const scopedFriend = await getScopedFriend(db, scope, friendId);
  if (!scopedFriend.ok) {
    return scopedFriend;
  }

  if (!body.targetDate) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'targetDate is required' },
    };
  }

  const enrollment = await enrollFriendInReminder(db, {
    friendId: scopedFriend.data.id,
    reminderId: scopedReminder.data.id,
    targetDate: body.targetDate,
  });
  return {
    ok: true,
    data: {
      id: friendReminderIdFromStorage(enrollment.id),
      friendId: friendIdFromStorage(enrollment.friend_id),
      reminderId: reminderIdFromStorage(enrollment.reminder_id),
      targetDate: enrollment.target_date,
      status: enrollment.status,
    },
  };
}

export async function listFriendReminderEnrollments(
  db: D1Database,
  scope: LineAccountScope,
  friendId: string,
): Promise<Readonly<{ ok: true; data: readonly SerializedFriendReminder[] }> | ReminderFailure> {
  const scopedFriend = await getScopedFriend(db, scope, friendId);
  if (!scopedFriend.ok) {
    return scopedFriend;
  }

  const items = await getFriendReminders(db, scopedFriend.data.id);
  return { ok: true, data: items.map(serializeFriendReminder) };
}

export async function cancelFriendReminderEnrollment(
  db: D1Database,
  scope: LineAccountScope,
  friendReminderId: string,
): Promise<Readonly<{ ok: true; data: null }> | ReminderFailure> {
  const friendReminder = await db
    .prepare(`SELECT friend_id FROM friend_reminders WHERE id = ?`)
    .bind(friendReminderId)
    .first<{ friend_id: string }>();
  if (!friendReminder) {
    return reminderNotFoundFailure('Not found');
  }

  const scopedFriend = await getScopedFriend(db, scope, friendReminder.friend_id);
  if (!scopedFriend.ok) {
    return reminderNotFoundFailure('Not found');
  }

  await cancelFriendReminder(db, friendReminderId);
  return { ok: true, data: null };
}
