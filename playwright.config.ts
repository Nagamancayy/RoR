import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ROR_MASTER_KEY: randomBytes(32).toString('hex'),
      DATABASE_URL: `file:./data/e2e-${Date.now()}.db`,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
