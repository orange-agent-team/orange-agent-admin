import { defineConfig } from '@playwright/test';

const production = process.env.ORANGE_ADMIN_TEST_BUILD === '1';
const baseURL = production ? 'http://127.0.0.1:43111' : 'http://127.0.0.1:43110';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: { baseURL, channel: 'chrome', viewport: { width: 1440, height: 960 }, trace: 'retain-on-failure' },
  webServer: { command: production ? 'npm run preview' : 'npm run dev', url: baseURL, reuseExistingServer: false, timeout: 30000 },
});
