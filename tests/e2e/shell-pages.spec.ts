import { expect, test } from '@playwright/test';
import { loginWithValidApiKey } from './helpers';
import { mockWebApi } from './mock-web-api';

test.describe('post-login shell pages', () => {
  test.beforeEach(async ({ page }) => {
    await mockWebApi(page);
    await loginWithValidApiKey(page);
  });

  const pages: { path: string; heading: string | RegExp }[] = [
    { path: '/scenarios', heading: 'シナリオ配信' },
    { path: '/broadcasts', heading: '一斉配信' },
    { path: '/templates', heading: 'テンプレート管理' },
    { path: '/automations', heading: 'オートメーション' },
    { path: '/scoring', heading: 'スコアリング' },
    { path: '/reminders', heading: 'リマインダ配信' },
    { path: '/chats', heading: 'オペレーターチャット' },
    { path: '/conversions', heading: 'コンバージョン計測' },
    { path: '/affiliates', heading: '流入経路分析' },
    { path: '/webhooks', heading: 'Webhook管理' },
    { path: '/accounts', heading: 'LINEアカウント管理' },
    { path: '/health', heading: 'BAN検知ダッシュボード' },
    { path: '/emergency', heading: '緊急コントロール' },
  ];

  for (const { path, heading } of pages) {
    test(`renders ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    });
  }
});
