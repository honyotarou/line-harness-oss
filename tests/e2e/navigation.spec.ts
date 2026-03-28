import { expect, test } from '@playwright/test';
import { mockWebApi } from './mock-web-api';

test('loads friends list with account-scoped API calls after login', async ({ page }) => {
  const friendsRequests: URL[] = [];
  await mockWebApi(page, {
    onApiRequest({ url }) {
      if (url.pathname === '/api/friends' || url.pathname === '/api/tags') {
        friendsRequests.push(url);
      }
    },
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('APIキーを入力').fill('valid-key');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/');

  friendsRequests.length = 0;
  await page.goto('/friends', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: '友だち管理' })).toBeVisible();
  await expect(page.getByText('テスト太郎')).toBeVisible();

  await expect
    .poll(() =>
      friendsRequests.some(
        (url) =>
          url.pathname === '/api/friends'
          && url.searchParams.get('lineAccountId') === 'account-1'
          && url.searchParams.get('limit') === '20',
      ),
    )
    .toBe(true);
});
