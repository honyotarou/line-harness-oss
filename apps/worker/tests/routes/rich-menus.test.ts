import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getFriendById: vi.fn(),
  getLineAccountById: vi.fn(),
  listPrincipalLineAccountIdsForEmail: vi.fn(),
}));

vi.mock('@line-crm/db', async (importOriginal) => {
  const o = await importOriginal<typeof import('@line-crm/db')>();
  return {
    ...o,
    getFriendById: dbMocks.getFriendById,
    getLineAccountById: dbMocks.getLineAccountById,
    listPrincipalLineAccountIdsForEmail: dbMocks.listPrincipalLineAccountIdsForEmail,
  };
});

const lineSdkMocks = vi.hoisted(() => ({
  lineClientCtor: vi.fn(),
  getRichMenuList: vi.fn().mockResolvedValue({ richmenus: [{ richMenuId: 'rm-1' }] }),
  createRichMenu: vi.fn().mockResolvedValue({ richMenuId: 'rm-created' }),
  deleteRichMenu: vi.fn().mockResolvedValue(undefined),
  setDefaultRichMenu: vi.fn().mockResolvedValue(undefined),
  uploadRichMenuImage: vi.fn().mockResolvedValue(undefined),
  linkRichMenuToUser: vi.fn().mockResolvedValue(undefined),
  unlinkRichMenuFromUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@line-crm/line-sdk', () => ({
  LineClient: vi.fn().mockImplementation((token: string) => {
    lineSdkMocks.lineClientCtor(token);
    return {
      getRichMenuList: lineSdkMocks.getRichMenuList,
      createRichMenu: lineSdkMocks.createRichMenu,
      deleteRichMenu: lineSdkMocks.deleteRichMenu,
      setDefaultRichMenu: lineSdkMocks.setDefaultRichMenu,
      uploadRichMenuImage: lineSdkMocks.uploadRichMenuImage,
      linkRichMenuToUser: lineSdkMocks.linkRichMenuToUser,
      unlinkRichMenuFromUser: lineSdkMocks.unlinkRichMenuFromUser,
    };
  }),
}));

const minimalMenu = {
  size: { width: 2500, height: 843 },
  selected: false,
  name: 'test-menu',
  chatBarText: 'メニュー',
  areas: [] as { bounds: Record<string, number>; action: Record<string, string> }[],
};

const tinyPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function env(): EnvSubset {
  return {
    DB: {} as D1Database,
    LINE_CHANNEL_ACCESS_TOKEN: 'default-token',
  };
}

function envCfScoped(): EnvSubset & typeof cfEnv {
  return {
    ...env(),
    ...cfEnv,
  };
}

type EnvSubset = { DB: D1Database; LINE_CHANNEL_ACCESS_TOKEN: string };

const cfEnv = {
  REQUIRE_CLOUDFLARE_ACCESS_JWT: '1',
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
} as const;

describe('rich menu routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue([]);
    lineSdkMocks.lineClientCtor.mockClear();
    lineSdkMocks.getRichMenuList.mockClear();
    lineSdkMocks.createRichMenu.mockClear();
    lineSdkMocks.deleteRichMenu.mockClear();
    lineSdkMocks.setDefaultRichMenu.mockClear();
    lineSdkMocks.uploadRichMenuImage.mockClear();
    lineSdkMocks.linkRichMenuToUser.mockClear();
    lineSdkMocks.unlinkRichMenuFromUser.mockClear();
    lineSdkMocks.getRichMenuList.mockResolvedValue({ richmenus: [{ richMenuId: 'rm-1' }] });
    lineSdkMocks.createRichMenu.mockResolvedValue({ richMenuId: 'rm-created' });
  });

  it('GET /api/rich-menus uses the requested account token when lineAccountId is set', async () => {
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'account-2',
      channel_access_token: 'account-2-token',
    });

    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.route('/', richMenus);

    const response = await app.fetch(
      new Request('http://localhost/api/rich-menus?lineAccountId=account-2'),
      env(),
    );

    expect(response.status).toBe(200);
    expect(lineSdkMocks.lineClientCtor).toHaveBeenCalledWith('account-2-token');
    const json = (await response.json()) as { data: unknown[] };
    expect(json.data).toEqual([{ richMenuId: 'rm-1' }]);
  });

  it('POST /api/rich-menus returns 413 when Content-Length exceeds admin JSON limit', async () => {
    const { DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES } = await import(
      '../../src/services/request-body.js'
    );
    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.route('/', richMenus);

    const over = DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES + 1;
    const response = await app.fetch(
      new Request('http://localhost/api/rich-menus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(over),
        },
        body: 'x'.repeat(over),
      }),
      env(),
    );

    expect(response.status).toBe(413);
    const json = (await response.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toBe('Request body too large');
    expect(lineSdkMocks.createRichMenu).not.toHaveBeenCalled();
  });

  it('POST /api/rich-menus strips lineAccountId before calling LINE createRichMenu', async () => {
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'account-2',
      channel_access_token: 'account-2-token',
    });

    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.route('/', richMenus);

    const response = await app.fetch(
      new Request('http://localhost/api/rich-menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineAccountId: 'account-2',
          ...minimalMenu,
        }),
      }),
      env(),
    );

    expect(response.status).toBe(201);
    expect(lineSdkMocks.lineClientCtor).toHaveBeenCalledWith('account-2-token');
    expect(lineSdkMocks.createRichMenu).toHaveBeenCalledTimes(1);
    const payload = lineSdkMocks.createRichMenu.mock.calls[0][0];
    expect(payload).not.toHaveProperty('lineAccountId');
    expect(payload).toMatchObject({ name: 'test-menu', chatBarText: 'メニュー' });
    const json = (await response.json()) as { data: { richMenuId: string } };
    expect(json.data.richMenuId).toBe('rm-created');
  });

  it('POST /api/rich-menus rejects tel: actions (do not put phone on rich menu)', async () => {
    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.route('/', richMenus);

    const response = await app.fetch(
      new Request('http://localhost/api/rich-menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...minimalMenu,
          areas: [
            {
              bounds: { x: 0, y: 0, width: 1250, height: 843 },
              action: { type: 'uri', uri: 'tel:0312345678' },
            },
          ],
        }),
      }),
      env(),
    );

    expect(response.status).toBe(400);
    expect(lineSdkMocks.createRichMenu).not.toHaveBeenCalled();
    const json = (await response.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toContain('tel:');
  });

  it('POST /api/rich-menus/:id/default calls setDefaultRichMenu', async () => {
    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.route('/', richMenus);

    const response = await app.fetch(
      new Request('http://localhost/api/rich-menus/rm-xyz/default', { method: 'POST' }),
      env(),
    );

    expect(response.status).toBe(200);
    expect(lineSdkMocks.setDefaultRichMenu).toHaveBeenCalledWith('rm-xyz');
  });

  it('DELETE /api/rich-menus/:id calls deleteRichMenu', async () => {
    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.route('/', richMenus);

    const response = await app.fetch(
      new Request('http://localhost/api/rich-menus/rm-del', { method: 'DELETE' }),
      env(),
    );

    expect(response.status).toBe(200);
    expect(lineSdkMocks.deleteRichMenu).toHaveBeenCalledWith('rm-del');
  });

  it('POST /api/rich-menus/:id/image accepts base64 JSON and uploads PNG', async () => {
    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.route('/', richMenus);

    const response = await app.fetch(
      new Request('http://localhost/api/rich-menus/rm-1/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: tinyPngBase64,
          contentType: 'image/png',
        }),
      }),
      env(),
    );

    expect(response.status).toBe(200);
    expect(lineSdkMocks.uploadRichMenuImage).toHaveBeenCalledWith(
      'rm-1',
      expect.any(ArrayBuffer),
      'image/png',
    );
  });

  it('POST /api/rich-menus/:id/image returns 400 when bytes are not valid PNG/JPEG', async () => {
    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.route('/', richMenus);

    const bogus = Buffer.from('totally-not-an-image').toString('base64');
    const response = await app.fetch(
      new Request('http://localhost/api/rich-menus/rm-1/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: bogus,
          contentType: 'image/png',
        }),
      }),
      env(),
    );

    expect(response.status).toBe(400);
    const json = (await response.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/PNG|JPEG|format/i);
    expect(lineSdkMocks.uploadRichMenuImage).not.toHaveBeenCalled();
  });

  it('POST /api/rich-menus/:id/image returns 400 when JSON body has no image', async () => {
    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.route('/', richMenus);

    const response = await app.fetch(
      new Request('http://localhost/api/rich-menus/rm-1/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/png' }),
      }),
      env(),
    );

    expect(response.status).toBe(400);
    expect(lineSdkMocks.uploadRichMenuImage).not.toHaveBeenCalled();
  });

  it('POST /api/rich-menus/:id/image returns 400 for unsupported Content-Type', async () => {
    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.route('/', richMenus);

    const response = await app.fetch(
      new Request('http://localhost/api/rich-menus/rm-1/image', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'x',
      }),
      env(),
    );

    expect(response.status).toBe(400);
    expect(lineSdkMocks.uploadRichMenuImage).not.toHaveBeenCalled();
  });

  it('POST /api/friends/:friendId/rich-menu uses the friend account token and links menu', async () => {
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'line-user-1',
      line_account_id: 'account-2',
    });
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'account-2',
      channel_access_token: 'account-2-token',
    });

    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.route('/', richMenus);

    const response = await app.fetch(
      new Request('http://localhost/api/friends/friend-1/rich-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ richMenuId: 'rm-1' }),
      }),
      env(),
    );

    expect(response.status).toBe(200);
    expect(lineSdkMocks.lineClientCtor).toHaveBeenCalledWith('account-2-token');
    expect(lineSdkMocks.linkRichMenuToUser).toHaveBeenCalledWith('line-user-1', 'rm-1');
  });

  it('DELETE /api/friends/:friendId/rich-menu unlinks rich menu', async () => {
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'line-user-1',
      line_account_id: null,
    });

    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.route('/', richMenus);

    const response = await app.fetch(
      new Request('http://localhost/api/friends/friend-1/rich-menu', { method: 'DELETE' }),
      env(),
    );

    expect(response.status).toBe(200);
    expect(lineSdkMocks.unlinkRichMenuFromUser).toHaveBeenCalledWith('line-user-1');
  });

  it('POST /api/friends/:friendId/rich-menu returns 400 when richMenuId is missing', async () => {
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'U1',
      line_account_id: null,
    });

    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.route('/', richMenus);

    const response = await app.fetch(
      new Request('http://localhost/api/friends/friend-1/rich-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      env(),
    );

    expect(response.status).toBe(400);
    expect(lineSdkMocks.linkRichMenuToUser).not.toHaveBeenCalled();
  });

  it('returns 400 when a scoped principal omits lineAccountId on GET /api/rich-menus', async () => {
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue(['allowed-account']);

    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', richMenus);

    const response = await app.fetch(new Request('http://localhost/api/rich-menus'), envCfScoped());

    expect(response.status).toBe(400);
    const j = (await response.json()) as { error?: string };
    expect(j.error).toMatch(/lineAccountId/i);
    expect(lineSdkMocks.getRichMenuList).not.toHaveBeenCalled();
  });

  it('returns 400 when a scoped principal omits lineAccountId on POST /api/rich-menus', async () => {
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue(['allowed-account']);

    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', richMenus);

    const response = await app.fetch(
      new Request('http://localhost/api/rich-menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...minimalMenu }),
      }),
      envCfScoped(),
    );

    expect(response.status).toBe(400);
    expect(lineSdkMocks.createRichMenu).not.toHaveBeenCalled();
  });

  it('returns 404 for POST /api/friends/:id/rich-menu when friend line account is outside scope', async () => {
    dbMocks.listPrincipalLineAccountIdsForEmail.mockResolvedValue(['allowed-account']);
    dbMocks.getFriendById.mockResolvedValue({
      id: 'friend-1',
      line_user_id: 'line-user-1',
      line_account_id: 'other-account',
    });

    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('cfAccessJwtPayload', { email: 'scoped@example.com' });
      await next();
    });
    app.route('/', richMenus);

    const response = await app.fetch(
      new Request('http://localhost/api/friends/friend-1/rich-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ richMenuId: 'rm-1' }),
      }),
      envCfScoped(),
    );

    expect(response.status).toBe(404);
    expect(lineSdkMocks.linkRichMenuToUser).not.toHaveBeenCalled();
  });
});
