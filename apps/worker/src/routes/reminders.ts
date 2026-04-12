import { Hono } from 'hono';
import {
  getReminders,
  getReminderById,
  createReminder,
  updateReminder,
  deleteReminder,
  getReminderSteps,
  createReminderStep,
  deleteReminderStep,
  enrollFriendInReminder,
  getFriendReminders,
  cancelFriendReminder,
  getFriendById,
} from '@line-crm/db';
import type { Env } from '../index.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import {
  resolveLineAccountScopeForRequest,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountBody,
  validateScopedLineAccountQueryParam,
} from '../services/admin-line-account-scope.js';

const reminders = new Hono<Env>();

// ========== リマインダCRUD ==========

reminders.get('/api/reminders', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const lineAccountId = c.req.query('lineAccountId');
    const qRem = validateScopedLineAccountQueryParam(scope, lineAccountId);
    if (!qRem.ok) {
      return c.json({ success: false, error: qRem.error }, qRem.status);
    }
    let items: Awaited<ReturnType<typeof getReminders>>;
    if (lineAccountId) {
      const result = await c.env.DB.prepare(
        `SELECT * FROM reminders WHERE line_account_id = ? ORDER BY created_at DESC`,
      )
        .bind(lineAccountId)
        .all();
      items = result.results as unknown as Awaited<ReturnType<typeof getReminders>>;
    } else {
      items = await getReminders(c.env.DB);
    }
    return c.json({
      success: true,
      data: items.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isActive: Boolean(r.is_active),
        lineAccountId: r.line_account_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/reminders error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

reminders.get('/api/reminders/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const scopeOne = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const [reminder, steps] = await Promise.all([
      getReminderById(c.env.DB, id),
      getReminderSteps(c.env.DB, id),
    ]);
    if (!reminder) return c.json({ success: false, error: 'Reminder not found' }, 404);
    if (!resourceLineAccountVisibleInScope(scopeOne, reminder.line_account_id)) {
      return c.json({ success: false, error: 'Reminder not found' }, 404);
    }
    return c.json({
      success: true,
      data: {
        id: reminder.id,
        name: reminder.name,
        description: reminder.description,
        isActive: Boolean(reminder.is_active),
        lineAccountId: reminder.line_account_id,
        createdAt: reminder.created_at,
        updatedAt: reminder.updated_at,
        steps: steps.map((s) => ({
          id: s.id,
          reminderId: s.reminder_id,
          offsetMinutes: s.offset_minutes,
          messageType: s.message_type,
          messageContent: s.message_content,
          createdAt: s.created_at,
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/reminders/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

reminders.post('/api/reminders', async (c) => {
  try {
    const scopePost = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const body = await readJsonBodyWithLimit<{
      name: string;
      description?: string;
      lineAccountId?: string | null;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);

    const scoped = validateScopedLineAccountBody(scopePost, body.lineAccountId ?? null);
    if (!scoped.ok) {
      return c.json({ success: false, error: scoped.error }, scoped.status);
    }

    const item = await createReminder(c.env.DB, {
      name: body.name,
      description: body.description,
      lineAccountId: scoped.lineAccountId,
    });
    return c.json(
      {
        success: true,
        data: {
          id: item.id,
          name: item.name,
          lineAccountId: item.line_account_id ?? null,
          createdAt: item.created_at,
        },
      },
      201,
    );
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/reminders error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

reminders.put('/api/reminders/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const scopePut = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const existingRm = await getReminderById(c.env.DB, id);
    if (!existingRm) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }
    if (!resourceLineAccountVisibleInScope(scopePut, existingRm.line_account_id)) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    if (body.lineAccountId !== undefined || body.line_account_id !== undefined) {
      const rawLa = body.lineAccountId ?? body.line_account_id;
      const scopedLa = validateScopedLineAccountBody(
        scopePut,
        rawLa === null ? null : typeof rawLa === 'string' ? rawLa : null,
      );
      if (!scopedLa.ok) {
        return c.json({ success: false, error: scopedLa.error }, scopedLa.status);
      }
      body.lineAccountId = scopedLa.lineAccountId;
    }
    await updateReminder(c.env.DB, id, body as never);
    const updated = await getReminderById(c.env.DB, id);
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        isActive: Boolean(updated.is_active),
        lineAccountId: updated.line_account_id,
      },
    });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/reminders/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

reminders.delete('/api/reminders/:id', async (c) => {
  try {
    const scopeDelRm = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const exDel = await getReminderById(c.env.DB, c.req.param('id'));
    if (!exDel) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }
    if (!resourceLineAccountVisibleInScope(scopeDelRm, exDel.line_account_id)) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }
    await deleteReminder(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/reminders/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== リマインダステップ ==========

reminders.post('/api/reminders/:id/steps', async (c) => {
  try {
    const reminderId = c.req.param('id');
    const scopeStep = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const parentRm = await getReminderById(c.env.DB, reminderId);
    if (!parentRm) {
      return c.json({ success: false, error: 'Reminder not found' }, 404);
    }
    if (!resourceLineAccountVisibleInScope(scopeStep, parentRm.line_account_id)) {
      return c.json({ success: false, error: 'Reminder not found' }, 404);
    }

    const body = await readJsonBodyWithLimit<{
      offsetMinutes: number;
      messageType: string;
      messageContent: string;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    if (body.offsetMinutes === undefined || !body.messageType || !body.messageContent) {
      return c.json(
        { success: false, error: 'offsetMinutes, messageType, messageContent are required' },
        400,
      );
    }
    const step = await createReminderStep(c.env.DB, { reminderId, ...body });
    return c.json(
      {
        success: true,
        data: {
          id: step.id,
          reminderId: step.reminder_id,
          offsetMinutes: step.offset_minutes,
          messageType: step.message_type,
          createdAt: step.created_at,
        },
      },
      201,
    );
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/reminders/:id/steps error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

reminders.delete('/api/reminders/:reminderId/steps/:stepId', async (c) => {
  try {
    const scopeDelStep = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const reminderIdDel = c.req.param('reminderId');
    const parentDel = await getReminderById(c.env.DB, reminderIdDel);
    if (!parentDel) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }
    if (!resourceLineAccountVisibleInScope(scopeDelStep, parentDel.line_account_id)) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }
    const stepRow = await c.env.DB.prepare(
      `SELECT id FROM reminder_steps WHERE id = ? AND reminder_id = ?`,
    )
      .bind(c.req.param('stepId'), reminderIdDel)
      .first<{ id: string }>();
    if (!stepRow) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }
    await deleteReminderStep(c.env.DB, c.req.param('stepId'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/reminders/:reminderId/steps/:stepId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 友だちリマインダ登録 ==========

reminders.post('/api/reminders/:id/enroll/:friendId', async (c) => {
  try {
    const reminderId = c.req.param('id');
    const friendId = c.req.param('friendId');
    const scopeEnroll = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const remEnroll = await getReminderById(c.env.DB, reminderId);
    if (!remEnroll) {
      return c.json({ success: false, error: 'Reminder not found' }, 404);
    }
    if (!resourceLineAccountVisibleInScope(scopeEnroll, remEnroll.line_account_id)) {
      return c.json({ success: false, error: 'Reminder not found' }, 404);
    }
    const friendEnroll = await getFriendById(c.env.DB, friendId);
    if (!friendEnroll) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }
    if (!resourceLineAccountVisibleInScope(scopeEnroll, friendEnroll.line_account_id)) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }

    const body = await readJsonBodyWithLimit<{ targetDate: string }>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    if (!body.targetDate) return c.json({ success: false, error: 'targetDate is required' }, 400);
    const enrollment = await enrollFriendInReminder(c.env.DB, {
      friendId,
      reminderId,
      targetDate: body.targetDate,
    });
    return c.json(
      {
        success: true,
        data: {
          id: enrollment.id,
          friendId: enrollment.friend_id,
          reminderId: enrollment.reminder_id,
          targetDate: enrollment.target_date,
          status: enrollment.status,
        },
      },
      201,
    );
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/reminders/:id/enroll/:friendId error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

reminders.get('/api/friends/:friendId/reminders', async (c) => {
  try {
    const friendId = c.req.param('friendId');
    const scopeFr = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const friendFr = await getFriendById(c.env.DB, friendId);
    if (!friendFr) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }
    if (!resourceLineAccountVisibleInScope(scopeFr, friendFr.line_account_id)) {
      return c.json({ success: false, error: 'Friend not found' }, 404);
    }
    const items = await getFriendReminders(c.env.DB, friendId);
    return c.json({
      success: true,
      data: items.map((fr) => ({
        id: fr.id,
        friendId: fr.friend_id,
        reminderId: fr.reminder_id,
        targetDate: fr.target_date,
        status: fr.status,
        createdAt: fr.created_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/friends/:friendId/reminders error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

reminders.delete('/api/friend-reminders/:id', async (c) => {
  try {
    const scopeCancel = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const frRow = await c.env.DB.prepare(`SELECT friend_id FROM friend_reminders WHERE id = ?`)
      .bind(c.req.param('id'))
      .first<{ friend_id: string }>();
    if (!frRow) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }
    const friendCancel = await getFriendById(c.env.DB, frRow.friend_id);
    if (
      !friendCancel ||
      !resourceLineAccountVisibleInScope(scopeCancel, friendCancel.line_account_id)
    ) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }
    await cancelFriendReminder(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/friend-reminders/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { reminders };
