import { defineConfig, devices } from '@playwright/test';

const tlockOnly = process.env.REMEMORY_TEST_TLOCK === '1';
const screenshotsOnly = process.env.REMEMORY_TEST_SCREENSHOTS === '1';

export default defineConfig({
  testDir: './e2e',
  ...(tlockOnly
    ? { testMatch: ['**/tlock.spec.ts'] }
    : screenshotsOnly
      ? { testMatch: ['**/screenshots.spec.ts'] }
      : { testIgnore: ['**/tlock.spec.ts', '**/screenshots.spec.ts'] }),
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
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox-crypto',
      use: { ...devices['Desktop Firefox'] },
      grep: /@cross-browser/,
    },
  ],
});
