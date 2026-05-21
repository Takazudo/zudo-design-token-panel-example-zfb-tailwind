/**
 * Playwright config for the zfb-tailwind example's e2e specs.
 *
 * webServer runs `zfb build && zfb preview` rather than `zfb dev`.
 * The dev server does NOT inject the islands.js script tag, so
 * `window.zfbTw` stays undefined in dev mode.
 * See Takazudo/zudo-front-builder#377 (closed — by-design).
 *
 * The bin sidecar (design-token-panel-server) is started separately for
 * the apply-roundtrip spec; that spec drives fetch() directly, so no
 * webServer entry is needed for it here.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'html',
  maxFailures: 0,
  timeout: process.env.CI ? 90_000 : 60_000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4173',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm run build && pnpm exec zfb preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
