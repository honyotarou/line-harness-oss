import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidAdminAuthToken, readAdminSessionCookie } from '../../src/services/admin-session.js';
import { verifyLineIdToken } from '../../src/services/line-id-token.js';

vi.mock('../../src/services/admin-session.js', () => ({
  isValidAdminAuthToken: vi.fn(),
  readAdminSessionCookie: vi.fn(),
}));

vi.mock('../../src/services/line-id-token.js', () => ({
  collectLineLoginChannelIds: vi.fn(() => ['login-channel']),
  verifyLineIdToken: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  getFormById: vi.fn(),
  getLineAccounts: vi.fn().mockResolvedValue([]),
}));

vi.mock('@line-crm/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@line-crm/db')>();
  return {
    ...actual,
    getFormById: dbMocks.getFormById,
    getLineAccounts: dbMocks.getLineAccounts,
  };
});

describe('GET /api/forms/:id', () => {
  beforeEach(() => {
    vi.mocked(isValidAdminAuthToken).mockReset();
    vi.mocked(readAdminSessionCookie).mockReset().mockReturnValue(null);
    vi.mocked(verifyLineIdToken).mockReset();
    dbMocks.getFormById.mockReset();
    dbMocks.getLineAccounts.mockClear();
  });

  const formRow = {
    id: 'form-1',
    name: 'Survey',
    description: 'd',
    fields: '[{"name":"q","label":"Q","type":"text"}]',
    on_submit_tag_id: 'tag-secret',
    on_submit_scenario_id: 'scn-secret',
    save_to_metadata: 1,
    is_active: 1,
    submit_count: 42,
    created_at: '2026-03-25T10:00:00+09:00',
    updated_at: '2026-03-25T10:00:00+09:00',
  };

  it('returns empty fields array when stored form.fields JSON is corrupt', async () => {
    vi.mocked(verifyLineIdToken).mockResolvedValue({ sub: 'Uxxx' });
    dbMocks.getFormById.mockResolvedValue({ ...formRow, fields: '{not-json' });

    const { forms } = await import('../../src/routes/forms.js');
    const app = new Hono();
    app.route('/', forms);

    const res = await app.fetch(
      new Request('http://localhost/api/forms/form-1', {
        headers: { Authorization: 'Bearer line-id-token-jwt' },
      }),
      {
        DB: {} as D1Database,
        API_KEY: 'k',
        LINE_LOGIN_CHANNEL_ID: 'login-channel',
      } as never,
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { fields: unknown[] } };
    expect(json.data.fields).toEqual([]);
  });

  it('returns 401 without admin session or LINE ID token', async () => {
    dbMocks.getFormById.mockResolvedValue(formRow);

    const { forms } = await import('../../src/routes/forms.js');
    const app = new Hono();
    app.route('/', forms);

    const res = await app.fetch(new Request('http://localhost/api/forms/form-1'), {
      DB: {} as D1Database,
      API_KEY: 'k',
      LINE_LOGIN_CHANNEL_ID: 'login-channel',
    } as never);

    expect(res.status).toBe(401);
  });

  it('accepts lowercase bearer scheme for LINE ID token on GET /api/forms/:id', async () => {
    vi.mocked(verifyLineIdToken).mockResolvedValue({ sub: 'Uxxx' });
    dbMocks.getFormById.mockResolvedValue(formRow);

    const { forms } = await import('../../src/routes/forms.js');
    const app = new Hono();
    app.route('/', forms);

    const res = await app.fetch(
      new Request('http://localhost/api/forms/form-1', {
        headers: { Authorization: 'bearer line-id-token-jwt' },
      }),
      {
        DB: {} as D1Database,
        API_KEY: 'k',
        LINE_LOGIN_CHANNEL_ID: 'login-channel',
      } as never,
    );

    expect(res.status).toBe(200);
  });

  it('returns a public-safe payload for a valid LINE ID token', async () => {
    vi.mocked(verifyLineIdToken).mockResolvedValue({ sub: 'Uxxx' });
    dbMocks.getFormById.mockResolvedValue(formRow);

    const { forms } = await import('../../src/routes/forms.js');
    const app = new Hono();
    app.route('/', forms);

    const res = await app.fetch(
      new Request('http://localhost/api/forms/form-1', {
        headers: { Authorization: 'Bearer line-id-token-jwt' },
      }),
      {
        DB: {} as D1Database,
        API_KEY: 'k',
        LINE_LOGIN_CHANNEL_ID: 'login-channel',
      } as never,
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: Record<string, unknown> };
    expect(json.data).toEqual({
      id: 'form-1',
      name: 'Survey',
      description: 'd',
      fields: [{ name: 'q', label: 'Q', type: 'text' }],
      isActive: true,
    });
    expect(json.data).not.toHaveProperty('onSubmitTagId');
    expect(json.data).not.toHaveProperty('submitCount');
  });

  it('returns the full form for a valid admin session token', async () => {
    vi.mocked(isValidAdminAuthToken).mockResolvedValue(true);
    dbMocks.getFormById.mockResolvedValue(formRow);

    const { forms } = await import('../../src/routes/forms.js');
    const app = new Hono();
    app.route('/', forms);

    const res = await app.fetch(
      new Request('http://localhost/api/forms/form-1', {
        headers: { Authorization: 'Bearer admin-session' },
      }),
      {
        DB: {} as D1Database,
        API_KEY: 'k',
        LINE_LOGIN_CHANNEL_ID: 'login-channel',
      } as never,
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: Record<string, unknown> };
    expect(json.data.onSubmitTagId).toBe('tag-secret');
    expect(json.data.submitCount).toBe(42);
  });
});
