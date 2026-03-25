import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'NEXT_DIST_DIR=.next-playwright pnpm --filter web exec next dev --port 3001 --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3001/login',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
