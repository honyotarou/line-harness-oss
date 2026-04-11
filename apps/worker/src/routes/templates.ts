import { Hono } from 'hono';
import {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '@line-crm/db';
import type { Env } from '../index.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';

const templates = new Hono<Env>();

function serializeTemplate(item: {
  id: string;
  name: string;
  category: string;
  message_type: string;
  message_content: string;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    messageType: item.message_type,
    messageContent: item.message_content,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

templates.get('/api/templates', async (c) => {
  try {
    const category = c.req.query('category') ?? undefined;
    const items = await getTemplates(c.env.DB, category);
    return c.json({
      success: true,
      data: items.map(serializeTemplate),
    });
  } catch (err) {
    console.error('GET /api/templates error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

templates.get('/api/templates/:id', async (c) => {
  try {
    const item = await getTemplateById(c.env.DB, c.req.param('id'));
    if (!item) return c.json({ success: false, error: 'Template not found' }, 404);
    return c.json({ success: true, data: serializeTemplate(item) });
  } catch (err) {
    console.error('GET /api/templates/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

templates.post('/api/templates', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<{
      name: string;
      category?: string;
      messageType: string;
      messageContent: string;
    }>(c.req.raw, DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES);
    if (!body.name || !body.messageType || !body.messageContent) {
      return c.json(
        { success: false, error: 'name, messageType, messageContent are required' },
        400,
      );
    }
    const item = await createTemplate(c.env.DB, body);
    return c.json({ success: true, data: serializeTemplate(item) }, 201);
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('POST /api/templates error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

templates.put('/api/templates/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    await updateTemplate(c.env.DB, id, body);
    const updated = await getTemplateById(c.env.DB, id);
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: serializeTemplate(updated) });
  } catch (err) {
    const jr = jsonBodyReadErrorResponse(err);
    if (jr) return c.json(jr.body, jr.status);
    console.error('PUT /api/templates/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

templates.delete('/api/templates/:id', async (c) => {
  try {
    await deleteTemplate(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/templates/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { templates };
