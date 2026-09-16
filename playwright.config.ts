import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  // Cold Next.js compilation on a busy local laptop can exceed 45 seconds.
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node tests/support/serve.mjs',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ROR_MASTER_KEY: randomBytes(32).toString('hex'),
      DATABASE_URL: `file:./data/e2e-${Date.now()}.db`,
      NEXT_TELEMETRY_DISABLED: '1',
      OPENAI_API_KEY: 'test-only-key',
      OPENAI_ADVERSARY_MODEL: 'e2e-fixture',
    },
  },
});
