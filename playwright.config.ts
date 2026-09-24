import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Browsers live in .dev/ms-playwright (dev boundary). Run `pnpm build` first — the E2E server
// serves the built SPA.
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(import.meta.dirname, '.dev', 'ms-playwright');
const PORT = Number(process.env.E2E_PORT || 4790);

export default defineConfig({
  testDir: 'e2e',
  outputDir: '.dev/test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  webServer: { command: 'node e2e/server.mjs', url: `http://127.0.0.1:${PORT}/api/auth/state`, reuseExistingServer: false, timeout: 30_000 },
  projects: [
    { name: 'setup', testMatch: /setup\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-chromium', testMatch: /desktop\.spec\.ts/, dependencies: ['setup'], use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'v2-chromium', testMatch: /v2\.spec\.ts/, dependencies: ['desktop-chromium'], use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-chromium', testMatch: /mobile\.spec\.ts/, dependencies: ['v2-chromium'], use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'mobile-webkit', testMatch: /mobile\.spec\.ts/, dependencies: ['mobile-chromium'], use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } } },
  ],
});
