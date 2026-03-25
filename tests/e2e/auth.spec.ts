import { expect, test } from '@playwright/test';

async function mockWebApi(page: import('@playwright/test').Page) {
  const cookieUrl = 'http://127.0.0.1:8787';

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cookies = await page.context().cookies(cookieUrl);
    const hasSessionCookie = cookies.some((cookie) => cookie.name === 'lh_admin_session' && cookie.value === 'session-token');

    if (url.pathname === '/api/auth/login') {
      const body = request.postDataJSON() as { apiKey?: string };
      if (body.apiKey === 'valid-key') {
        await page.context().addCookies([
          {
            name: 'lh_admin_session',
            value: 'session-token',
            url: cookieUrl,
            httpOnly: true,
            sameSite: 'Lax',
            secure: false,
          },
        ]);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              expiresAt: '2026-03-26T00:00:00.000Z',
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      });
      return;
    }

    if (url.pathname === '/api/auth/logout') {
      await page.context().clearCookies();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: null }),
      });
      return;
    }

    if (url.pathname === '/api/auth/session') {
      if (hasSessionCookie) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { authenticated: true } }),
        });
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      });
      return;
    }

    if (url.pathname === '/api/friends/count') {
      if (hasSessionCookie) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { count: 42 } }),
        });
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      });
      return;
    }

    if (!hasSessionCookie) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      });
      return;
    }

    const ok = (data: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data }),
      });

    switch (url.pathname) {
      case '/api/line-accounts':
        await ok([
          {
            id: 'account-1',
            channelId: 'channel-1',
            name: 'Main Account',
            displayName: 'Main Account',
            isActive: true,
            stats: { friendCount: 42, activeScenarios: 2, messagesThisMonth: 10 },
          },
        ]);
        return;
      case '/api/scenarios':
        await ok([{ id: 'scenario-1', isActive: true }, { id: 'scenario-2', isActive: false }]);
        return;
      case '/api/broadcasts':
        await ok([{ id: 'broadcast-1' }]);
        return;
      case '/api/templates':
        await ok([{ id: 'template-1' }]);
        return;
      case '/api/automations':
        await ok([{ id: 'automation-1', isActive: true }]);
        return;
      case '/api/scoring-rules':
        await ok([{ id: 'rule-1' }]);
        return;
      default:
        await ok([]);
    }
  });
}

test('redirects unauthenticated users to the login page', async ({ page }) => {
  await mockWebApi(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'LINE Harness' })).toBeVisible();
});

test('shows an error when the API key is invalid', async ({ page }) => {
  await mockWebApi(page);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('APIキーを入力').fill('bad-key');
  await page.getByRole('button', { name: 'ログイン' }).click();

  await expect(page.getByText('APIキーが正しくありません')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('stores the session in an httpOnly cookie and loads the dashboard after login', async ({ page }) => {
  await mockWebApi(page);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('APIキーを入力').fill('valid-key');
  await page.getByRole('button', { name: 'ログイン' }).click();

  await expect(page).toHaveURL('http://127.0.0.1:3001/');
  await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
  await expect(page.getByText('Main Account の管理画面')).toBeVisible();
  await expect(page.getByText('42')).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem('lh_session_token'))).resolves.toBeNull();
  const cookies = await page.context().cookies('http://127.0.0.1:8787');
  expect(cookies.find((cookie) => cookie.name === 'lh_admin_session')?.httpOnly).toBe(true);
});

test('clears the admin session on logout', async ({ page }) => {
  await mockWebApi(page);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('APIキーを入力').fill('valid-key');
  await page.getByRole('button', { name: 'ログイン' }).click();

  await expect(page).toHaveURL('http://127.0.0.1:3001/');
  await page.getByRole('button', { name: 'ログアウト' }).click();

  await expect(page).toHaveURL(/\/login$/);
  const cookies = await page.context().cookies('http://127.0.0.1:8787');
  expect(cookies.find((cookie) => cookie.name === 'lh_admin_session')).toBeUndefined();
});
