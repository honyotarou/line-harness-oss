import { expect, test } from '@playwright/test';
import { mockWebApi } from './mock-web-api';

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

test('stores the session in an httpOnly cookie and loads the dashboard after login', async ({
  page,
}) => {
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

test('scopes dashboard KPI requests to the selected line account', async ({ page }) => {
  const dashboardRequests: URL[] = [];
  await mockWebApi(page, {
    onApiRequest({ url }) {
      if (
        url.pathname === '/api/friends/count' ||
        url.pathname === '/api/scenarios' ||
        url.pathname === '/api/broadcasts' ||
        url.pathname === '/api/automations'
      ) {
        dashboardRequests.push(url);
      }
    },
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('APIキーを入力').fill('valid-key');
  await page.getByRole('button', { name: 'ログイン' }).click();

  await expect(page).toHaveURL('http://127.0.0.1:3001/');
  await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();

  await expect
    .poll(() =>
      dashboardRequests.some(
        (url) =>
          url.pathname === '/api/friends/count' &&
          url.searchParams.get('lineAccountId') === 'account-1',
      ),
    )
    .toBe(true);

  await expect
    .poll(() =>
      dashboardRequests.some(
        (url) =>
          url.pathname === '/api/scenarios' &&
          url.searchParams.get('lineAccountId') === 'account-1',
      ),
    )
    .toBe(true);

  await expect
    .poll(() =>
      dashboardRequests.some(
        (url) =>
          url.pathname === '/api/broadcasts' &&
          url.searchParams.get('lineAccountId') === 'account-1',
      ),
    )
    .toBe(true);

  await expect
    .poll(() =>
      dashboardRequests.some(
        (url) =>
          url.pathname === '/api/automations' &&
          url.searchParams.get('lineAccountId') === 'account-1',
      ),
    )
    .toBe(true);
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

test('scopes notification page requests to the selected line account', async ({ page }) => {
  const notificationRequests: URL[] = [];
  await mockWebApi(page, {
    onApiRequest({ url }) {
      if (url.pathname.startsWith('/api/notifications')) {
        notificationRequests.push(url);
      }
    },
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('APIキーを入力').fill('valid-key');
  await page.getByRole('button', { name: 'ログイン' }).click();

  await expect(page).toHaveURL('http://127.0.0.1:3001/');

  notificationRequests.length = 0;
  await page.goto('/notifications', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: '通知ルール設定' })).toBeVisible();
  await expect(page.getByText('Main Account の通知ルールと履歴')).toBeVisible();

  await expect
    .poll(() =>
      notificationRequests.some(
        (url) =>
          url.pathname === '/api/notifications/rules' &&
          url.searchParams.get('lineAccountId') === 'account-1',
      ),
    )
    .toBe(true);

  await expect
    .poll(() =>
      notificationRequests.some(
        (url) =>
          url.pathname === '/api/notifications' &&
          url.searchParams.get('lineAccountId') === 'account-1' &&
          url.searchParams.get('limit') === '50',
      ),
    )
    .toBe(true);
});

test('blocks creating a user without any durable identifier in the UI', async ({ page }) => {
  const userCreateRequests: URL[] = [];
  await mockWebApi(page, {
    onApiRequest({ method, url }) {
      if (method === 'POST' && url.pathname === '/api/users') {
        userCreateRequests.push(url);
      }
    },
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('APIキーを入力').fill('valid-key');
  await page.getByRole('button', { name: 'ログイン' }).click();

  await expect(page).toHaveURL('http://127.0.0.1:3001/');

  await page.goto('/users', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'ユーザーUUID管理' })).toBeVisible();

  await page.getByRole('button', { name: '+ ユーザー作成' }).click();
  await page.getByPlaceholder('山田太郎').fill('No identifiers');
  await page.getByRole('button', { name: '作成' }).click();

  await expect(page.getByText('メール・電話番号・外部IDのいずれかは必須です')).toBeVisible();
  await expect.poll(() => userCreateRequests.length).toBe(0);
});
