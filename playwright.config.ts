import { defineConfig, devices } from '@playwright/test';

const tlockOnly = process.env.REMEMORY_TEST_TLOCK === '1';

export default defineConfig({
  testDir: './e2e',
  ...(tlockOnly ? { testMatch: ['**/tlock.spec.ts'] } : { testIgnore: ['**/tlock.spec.ts'] }),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? '75%' : undefined,
  reporter: [
    ['html', { outputFolder: 'e2e/playwright-report', open: 'never' }],
    ['list']
  ],
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
});
