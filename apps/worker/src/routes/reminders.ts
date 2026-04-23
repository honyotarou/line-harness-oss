import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import { resolveLineAccountScopeForRequest } from '../services/admin-line-account-scope.js';
import {
  createAdminReminder,
  createAdminReminderStep,
  deleteAdminReminder,
  deleteAdminReminderStep,
  enrollFriendInAdminReminder,
  getAdminReminder,
  listAdminReminders,
  listFriendReminderEnrollments,
  updateAdminReminder,
  cancelFriendReminderEnrollment,
} from '../application/admin-reminders.js';

const reminders = new Hono<Env>();

function jsonReminderFailure(
  c: { json: (body: unknown, status: 400 | 403 | 404) => Response },
  failure: Readonly<{ status: 400 | 403 | 404; body: unknown }>,
): Response {
  return c.json(failure.body, failure.status);
}

// ========== リマインダCRUD ==========

reminders.get('/api/reminders', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const lineAccountId = c.req.query('lineAccountId');
    const result = await listAdminReminders(c.env.DB, scope, lineAccountId);
    if (!result.ok) {
      return jsonReminderFailure(c, result);
    }
    return c.json({ success: true, data: result.data });
  } catch (err) {
    console.error('GET /api/reminders error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

reminders.get('/api/reminders/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await getAdminReminder(c.env.DB, scope, id);
    if (!result.ok) {
      return jsonReminderFailure(c, result);
    }
    return c.json({ success: true, data: result.data });
  } catch (err) {
    console.error('GET /api/reminders/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

reminders.post('/api/reminders', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{
      name: string;
      description?: string;
      lineAccountId?: string | null;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await createAdminReminder(c.env.DB, scope, body);
    if (!result.ok) {
      return jsonReminderFailure(c, result);
    }
    return c.json({ success: true, data: result.data }, 201);
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
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await updateAdminReminder(c.env.DB, scope, id, body);
    if (!result.ok) {
      return jsonReminderFailure(c, result);
    }
    return c.json({ success: true, data: result.data });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/reminders/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

reminders.delete('/api/reminders/:id', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await deleteAdminReminder(c.env.DB, scope, c.req.param('id'));
    if (!result.ok) {
      return jsonReminderFailure(c, result);
    }
    return c.json({ success: true, data: result.data });
  } catch (err) {
    console.error('DELETE /api/reminders/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== リマインダステップ ==========

reminders.post('/api/reminders/:id/steps', async (c) => {
  try {
    const reminderId = c.req.param('id');
    const body = await readJsonBodyWithLimit<{
      offsetMinutes: number;
      messageType: string;
      messageContent: string;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await createAdminReminderStep(c.env.DB, scope, reminderId, body);
    if (!result.ok) {
      return jsonReminderFailure(c, result);
    }
    return c.json({ success: true, data: result.data }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/reminders/:id/steps error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

reminders.delete('/api/reminders/:reminderId/steps/:stepId', async (c) => {
  try {
    const reminderIdDel = c.req.param('reminderId');
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await deleteAdminReminderStep(
      c.env.DB,
      scope,
      reminderIdDel,
      c.req.param('stepId'),
    );
    if (!result.ok) {
      return jsonReminderFailure(c, result);
    }
    return c.json({ success: true, data: result.data });
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
    const body = await readJsonBodyWithLimit<{ targetDate: string }>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await enrollFriendInAdminReminder(c.env.DB, scope, reminderId, friendId, body);
    if (!result.ok) {
      return jsonReminderFailure(c, result);
    }
    return c.json({ success: true, data: result.data }, 201);
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
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await listFriendReminderEnrollments(c.env.DB, scope, friendId);
    if (!result.ok) {
      return jsonReminderFailure(c, result);
    }
    return c.json({ success: true, data: result.data });
  } catch (err) {
    console.error('GET /api/friends/:friendId/reminders error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

reminders.delete('/api/friend-reminders/:id', async (c) => {
  try {
    const scope = await resolveLineAccountScopeForRequest(c.env.DB, c);
    const result = await cancelFriendReminderEnrollment(c.env.DB, scope, c.req.param('id'));
    if (!result.ok) {
      return jsonReminderFailure(c, result);
    }
    return c.json({ success: true, data: result.data });
  } catch (err) {
    console.error('DELETE /api/friend-reminders/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { reminders };
