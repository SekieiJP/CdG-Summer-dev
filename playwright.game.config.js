import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests-game',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'python3 -m http.server 8000 --bind 127.0.0.1 --directory game',
    url: 'http://localhost:8000',
    reuseExistingServer: true,
    timeout: 30 * 1000,
  },
});
