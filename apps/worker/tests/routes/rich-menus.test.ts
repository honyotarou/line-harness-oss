import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getFriendById: vi.fn(),
  getLineAccountById: vi.fn(),
}));

vi.mock('@line-crm/db', () => dbMocks);

const lineSdkMocks = vi.hoisted(() => ({
  lineClientCtor: vi.fn(),
  getRichMenuList: vi.fn().mockResolvedValue({ richmenus: [{ richMenuId: 'rm-1' }] }),
  linkRichMenuToUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@line-crm/line-sdk', () => ({
  LineClient: vi.fn().mockImplementation((token: string) => {
    lineSdkMocks.lineClientCtor(token);
    return {
      getRichMenuList: lineSdkMocks.getRichMenuList,
      linkRichMenuToUser: lineSdkMocks.linkRichMenuToUser,
      deleteRichMenu: vi.fn(),
      setDefaultRichMenu: vi.fn(),
      unlinkRichMenuFromUser: vi.fn(),
      uploadRichMenuImage: vi.fn(),
      createRichMenu: vi.fn(),
    };
  }),
}));

describe('rich menu routes', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    lineSdkMocks.lineClientCtor.mockClear();
    lineSdkMocks.getRichMenuList.mockClear();
    lineSdkMocks.linkRichMenuToUser.mockClear();
  });

  it('uses the requested account token when listing rich menus', async () => {
    dbMocks.getLineAccountById.mockResolvedValue({
      id: 'account-2',
      channel_access_token: 'account-2-token',
    });

    const { richMenus } = await import('../../src/routes/rich-menus.js');
    const app = new Hono();
    app.route('/', richMenus);

    const response = await app.fetch(
      new Request('http://localhost/api/rich-menus?lineAccountId=account-2'),
      {
        DB: {} as D1Database,
        LINE_CHANNEL_ACCESS_TOKEN: 'default-token',
      } as never,
    );

    expect(response.status).toBe(200);
    expect(lineSdkMocks.lineClientCtor).toHaveBeenCalledWith('account-2-token');
  });

  it('uses the friend account token when linking a rich menu to a friend', async () => {
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
      {
        DB: {} as D1Database,
        LINE_CHANNEL_ACCESS_TOKEN: 'default-token',
      } as never,
    );

    expect(response.status).toBe(200);
    expect(lineSdkMocks.lineClientCtor).toHaveBeenCalledWith('account-2-token');
    expect(lineSdkMocks.linkRichMenuToUser).toHaveBeenCalledWith('line-user-1', 'rm-1');
  });
});
