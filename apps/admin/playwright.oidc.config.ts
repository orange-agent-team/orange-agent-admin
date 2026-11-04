import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/identity', fullyParallel: false, workers: 1, retries: 0, timeout: 60000,
  reporter: 'list', outputDir: 'test-results-identity',
  // Self-signed loopback certificate only. Do not record credentials/tokens in traces.
  use: { baseURL: 'https://127.0.0.1:43112', channel: 'chrome', ignoreHTTPSErrors: true,
    trace: 'off', screenshot: 'off', video: 'off' },
});
