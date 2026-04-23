import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getForms: vi.fn(),
  createForm: vi.fn(),
}));

vi.mock('@line-crm/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@line-crm/db')>();
  return {
    ...actual,
    getForms: dbMocks.getForms,
    createForm: dbMocks.createForm,
  };
});

describe('admin forms routes', () => {
  beforeEach(() => {
    vi.resetModules();
    dbMocks.getForms.mockReset();
    dbMocks.createForm.mockReset();
  });

  it('GET /api/forms escapes HTML and tolerates corrupt field JSON', async () => {
    dbMocks.getForms.mockResolvedValue([
      {
        id: 'form-1',
        name: 'T<form>',
        description: '<p>x</p>',
        fields: '{bad-json',
        on_submit_tag_id: 'tag-1',
        on_submit_scenario_id: 'scenario-1',
        save_to_metadata: 1,
        is_active: 1,
        submit_count: 2,
        created_at: '2026-03-25T10:00:00+09:00',
        updated_at: '2026-03-25T10:00:00+09:00',
      },
    ]);

    const { forms } = await import('../../src/routes/forms.js');
    const app = new Hono();
    app.route('/', forms);

    const res = await app.fetch(new Request('http://localhost/api/forms'), {
      DB: {} as D1Database,
      API_KEY: 'k',
      LINE_LOGIN_CHANNEL_ID: 'login-channel',
    } as never);

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: Array<{ name: string; description: string | null; fields: unknown[] }>;
    };
    expect(json.data).toEqual([
      {
        id: 'form-1',
        name: 'T&lt;form&gt;',
        description: '&lt;p&gt;x&lt;/p&gt;',
        fields: [],
        onSubmitTagId: 'tag-1',
        onSubmitScenarioId: 'scenario-1',
        saveToMetadata: true,
        isActive: true,
        submitCount: 2,
        createdAt: '2026-03-25T10:00:00+09:00',
        updatedAt: '2026-03-25T10:00:00+09:00',
      },
    ]);
  });

  it('POST /api/forms validates name and serializes fields for storage', async () => {
    dbMocks.createForm.mockResolvedValue({
      id: 'form-2',
      name: 'Survey',
      description: null,
      fields: '[{"name":"q","label":"Q","type":"text"}]',
      on_submit_tag_id: null,
      on_submit_scenario_id: null,
      save_to_metadata: 0,
      is_active: 1,
      submit_count: 0,
      created_at: '2026-03-25T10:00:00+09:00',
      updated_at: '2026-03-25T10:00:00+09:00',
    });

    const { forms } = await import('../../src/routes/forms.js');
    const app = new Hono();
    app.route('/', forms);

    const bad = await app.fetch(
      new Request('http://localhost/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'x' }),
      }),
      { DB: {} as D1Database, API_KEY: 'k', LINE_LOGIN_CHANNEL_ID: 'login-channel' } as never,
    );
    expect(bad.status).toBe(400);

    const res = await app.fetch(
      new Request('http://localhost/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Survey',
          fields: [{ name: 'q', label: 'Q', type: 'text' }],
          saveToMetadata: false,
        }),
      }),
      { DB: {} as D1Database, API_KEY: 'k', LINE_LOGIN_CHANNEL_ID: 'login-channel' } as never,
    );

    expect(res.status).toBe(201);
    expect(dbMocks.createForm).toHaveBeenCalledWith(expect.anything(), {
      name: 'Survey',
      description: null,
      fields: '[{"name":"q","label":"Q","type":"text"}]',
      onSubmitTagId: null,
      onSubmitScenarioId: null,
      saveToMetadata: false,
    });
  });
});
