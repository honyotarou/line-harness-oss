import { expect, test } from '@playwright/test';
import { loginWithValidApiKey } from './helpers';
import { mockWebApi } from './mock-web-api';

test.describe('mobile viewport shell', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('dashboard heading visible after login on narrow viewport', async ({ page }) => {
    await mockWebApi(page);
    await loginWithValidApiKey(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
  });
});
