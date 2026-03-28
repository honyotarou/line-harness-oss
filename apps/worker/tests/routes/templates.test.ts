import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getTemplates: vi.fn(),
  getTemplateById: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

describe('template routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it('returns the full template payload when creating a template', async () => {
    dbMocks.createTemplate.mockResolvedValue({
      id: 'template-1',
      name: 'Welcome',
      category: 'general',
      message_type: 'text',
      message_content: 'Hello there',
      created_at: '2026-03-26T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });

    const { templates } = await import('../../src/routes/templates.js');
    const app = new Hono();
    app.route('/', templates);

    const response = await app.fetch(
      new Request('http://localhost/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Welcome',
          category: 'general',
          messageType: 'text',
          messageContent: 'Hello there',
        }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'template-1',
        name: 'Welcome',
        category: 'general',
        messageType: 'text',
        messageContent: 'Hello there',
        createdAt: '2026-03-26T10:00:00+09:00',
        updatedAt: '2026-03-26T10:00:00+09:00',
      },
    });
  });

  it('returns the full template payload when updating a template', async () => {
    dbMocks.updateTemplate.mockResolvedValue(undefined);
    dbMocks.getTemplateById.mockResolvedValue({
      id: 'template-1',
      name: 'Updated template',
      category: 'campaign',
      message_type: 'flex',
      message_content: '{"type":"flex"}',
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-26T10:00:00+09:00',
    });

    const { templates } = await import('../../src/routes/templates.js');
    const app = new Hono();
    app.route('/', templates);

    const response = await app.fetch(
      new Request('http://localhost/api/templates/template-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated template',
          messageType: 'flex',
          messageContent: '{"type":"flex"}',
        }),
      }),
      { DB: {} as D1Database } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: 'template-1',
        name: 'Updated template',
        category: 'campaign',
        messageType: 'flex',
        messageContent: '{"type":"flex"}',
        createdAt: '2026-03-25T10:00:00+09:00',
        updatedAt: '2026-03-26T10:00:00+09:00',
      },
    });
  });
});
