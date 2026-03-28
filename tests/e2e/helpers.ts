import type { Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:3001';

/**
 * Completes admin login against the mocked Worker (`mockWebApi`).
 */
export async function loginWithValidApiKey(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('APIキーを入力').fill('valid-key');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForURL(`${BASE}/`);
}
