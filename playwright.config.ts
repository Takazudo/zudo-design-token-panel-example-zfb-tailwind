/**
 * Playwright config for the zfb-tailwind example's e2e specs.
 *
 * webServer builds, then serves the built output with `zfb preview`, and
 * starts the `zdtp-server` sidecar alongside it — the apply-roundtrip spec
 * POSTs to that sidecar, so without it a bare `pnpm test:e2e` could never pass.
 * Both come up through `scripts/launch.mjs`, which is also what `pnpm dev` and
 * `pnpm preview` use, so the ports and the sidecar's allowed CORS origins are
 * resolved exactly once (`scripts/ports.mjs`) and cannot drift from this config.
 *
 * Why preview rather than `zfb dev`: `zfb dev` does not inject the
 * `<script type="module" src="/assets/islands-*.js">` tag, so the Preact island
 * holding PanelMount never hydrates and `window.zfbTw` stays undefined
 * (Takazudo/zudo-front-builder#377, closed by-design). Re-verified against zfb
 * 2.15.1 with `dist/` removed — still true. Watch out when re-probing: a
 * leftover `dist/` masks it, because `zfb dev` serves the prebuilt
 * `dist/index.html` statically and the islands tag then appears to be there.
 *
 * `reuseExistingServer: false`, in CI and locally alike: preview serves a
 * *built* `dist/`, so reusing a server someone left running would silently test
 * a stale build — the exact false-green this harness exists to remove. Failing
 * on EADDRINUSE is the louder, more honest outcome. To test against a server
 * you are already running, pass `BASE_URL`; that hands the whole server
 * lifecycle — site AND sidecar — back to the caller. See README.md.
 *
 * The `undefined` branch keys off `BASE_URL` only, deliberately NOT off `CI`.
 * `deploy.yml` has no e2e step today, so a CI-gated `undefined` would be
 * invisible now and would silently strip the servers off the first CI run that
 * did add one — specs that pass because nothing was served are the failure mode
 * this whole harness pass is about.
 */

import { defineConfig, devices } from '@playwright/test';
// The three ports resolve in exactly one place so package.json's launcher,
// plugins/dev-apply-proxy.mjs, the specs and this config cannot disagree.
import { PREVIEW_PORT, BROWSER_ORIGIN } from './scripts/ports.mjs';

const hasExternalBaseUrl = Boolean(process.env.BASE_URL);

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
    baseURL: BROWSER_ORIGIN,
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
  webServer: hasExternalBaseUrl
    ? undefined
    : {
        // Build first so the islands script tag is injected, then serve the
        // built output and the apply sidecar together.
        command: 'pnpm run build && node scripts/launch.mjs test-servers',
        port: PREVIEW_PORT,
        reuseExistingServer: false,
        // Build can take ~30–60 s in CI.
        timeout: 180_000,
      },
});
