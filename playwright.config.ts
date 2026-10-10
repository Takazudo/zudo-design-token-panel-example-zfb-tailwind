/**
 * Playwright config for the ZFB + Wind example's browser suite.
 *
 * The suite runs against the BUILT site: `zfb build`, then `zfb preview`
 * (`PREVIEW_PORT`), plus the `zdtp-server` apply sidecar (`ZDTP_PORT`) — the
 * same `scripts/launch.mjs` targets `pnpm preview` and `pnpm dev` use, so the
 * ports and the sidecar's allowed CORS origins resolve exactly once
 * (`scripts/ports.mjs`). Each server is its own webServer entry, so Playwright
 * waits on both and fails the run if either one does not come up.
 * `tests/e2e/global-setup.ts` then proves the listeners are this checkout's
 * (sidecar writeRoot/routing, preview `/api/dev/apply` → sidecar wiring).
 *
 * The panel's Apply button works under preview because
 * plugins/dev-apply-proxy.mjs registers `/api/dev/apply` under zfb's
 * `previewMiddleware` as well as `devMiddleware`. Preview serves a built
 * `dist/`, so an Apply rewrites `styles/global.css` on disk without changing
 * what the browser is served — apply-roundtrip.spec.ts asserts those two facts
 * separately.
 *
 * Why preview rather than `zfb dev`: `zfb dev` does not inject the islands
 * script tag, so the PanelMount island never hydrates and `window.zfbTw` stays
 * undefined (Takazudo/zudo-front-builder#377, closed by-design).
 *
 * `reuseExistingServer: false` even locally: reusing a server someone left
 * running would silently test a stale build. Failing on EADDRINUSE is the
 * louder, more honest outcome. To test against servers you are already
 * running, pass `BASE_URL` — that hands the whole server lifecycle back to the
 * caller (global setup still verifies both). See README.md.
 *
 * No retries: CI's `browser` job is blocking, and a retry would turn a flaky
 * failure into a pass. `workers: 1` + no parallelism: the apply spec rewrites
 * `styles/global.css` on disk, and every spec shares one preview server.
 */

import { defineConfig, devices } from '@playwright/test';
// The three ports resolve in exactly one place so package.json's launcher,
// plugins/dev-apply-proxy.mjs, the specs and this config cannot disagree.
import { BROWSER_ORIGIN, ZDTP_PORT } from './scripts/ports.mjs';

const isCI = Boolean(process.env.CI);
const hasExternalBaseUrl = Boolean(process.env.BASE_URL);

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: 0,
  workers: 1,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'html',
  timeout: isCI ? 90_000 : 60_000,
  use: {
    baseURL: BROWSER_ORIGIN,
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: hasExternalBaseUrl
    ? undefined
    : [
        {
          // Build first so dist/ is this checkout's, then serve it.
          command: 'pnpm run build && node scripts/launch.mjs preview',
          url: `${BROWSER_ORIGIN}/`,
          reuseExistingServer: false,
          // Build can take ~30–60 s in CI.
          timeout: 180_000,
        },
        {
          command: 'node scripts/launch.mjs dev:sidecar',
          url: `http://127.0.0.1:${ZDTP_PORT}/healthz`,
          reuseExistingServer: false,
          timeout: 60_000,
        },
      ],
});
