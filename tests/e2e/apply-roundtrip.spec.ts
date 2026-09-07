/**
 * Apply-pipeline round-trip spec for the zfb-tailwind example.
 *
 * Exercises the bin sidecar (`zdtp-server`) apply endpoint
 * directly via fetch(), proving the full bin → CSS file rewrite path.
 *
 * Why fetch() rather than the panel's Apply button
 * ------------------------------------------------
 * Because the preview server has no `/api/dev/apply`: that route is registered
 * by `plugins/dev-apply-proxy.mjs` through zfb's `devMiddleware` hook, which
 * `zfb build`/`zfb preview` never invoke. Driving the UI here would post into
 * a 404, so the spec talks to the sidecar directly.
 *
 * NOTE — the historical reason recorded here was different, and is now stale.
 * This header used to say the panel's Apply payload carried *color* diffs only,
 * so a size token like `--zfbtw-radius` could never be applied from the UI. At
 * zdtp 0.5.1 that is no longer true: `buildApplyOverrides` emits spacing,
 * typography and size overrides too (see
 * `node_modules/@takazudo/zdtp/dist/apply/build-apply-overrides.d.ts`,
 * "Spacing / typography / size — EMITTED when the corresponding
 * `TokenOverrides` map is non-empty"). The spec below is unaffected — it never
 * went through the panel — but a UI-driven Apply spec is now buildable against
 * a `zfb dev` server, which this harness does not run. That rewrite is
 * deliberately out of scope here.
 *
 * Prerequisites
 * -------------
 *  - `zfb preview` serving the BUILT output and the `zdtp-server` sidecar,
 *    both started by playwright.config.ts's webServer via
 *    `node scripts/launch.mjs test-servers`. It must be preview, not
 *    `zfb dev`: dev injects no islands script tag, so `window.zfbTw` stays
 *    undefined (Takazudo/zudo-front-builder#377, closed — by-design; still
 *    true at zfb 2.15.1).
 *  - No port or origin is written down in this file. `scripts/ports.mjs`
 *    resolves `ZDTP_PORT` and the browser origin (from `PREVIEW_PORT`, or
 *    `BASE_URL` when the caller manages the servers), and the launcher passes
 *    the SAME origins to the sidecar's repeatable `--allow-origin`. That shared
 *    derivation is what stops the sidecar's CORS check and this POST's Origin
 *    header from drifting apart.
 *
 * Token path
 * ----------
 * `scaffold.routing.json`: { "zfbtw": "styles/global.css" }
 * The bin writes the updated token to `styles/global.css` in the repo root.
 *
 * The test restores the original token value inline, and `afterAll` restores
 * again as a safety net. Both restores ASSERT: a restore that silently failed
 * would leave `styles/global.css` dirty in the working tree and the next run
 * would compare against a corrupted baseline.
 */

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BROWSER_ORIGIN, ZDTP_PORT } from '../../scripts/ports.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// styles/global.css is two levels up from tests/e2e/.
const TOKENS_PATH = resolve(__dirname, '..', '..', 'styles', 'global.css');

// When running this spec against caller-managed servers, start the sidecar the
// same way the launcher does: `node scripts/launch.mjs dev:sidecar`, which
// passes every origin in SIDECAR_ALLOWED_ORIGINS to --allow-origin.
const APPLY_URL = `http://127.0.0.1:${ZDTP_PORT}/apply`;
// reason: the sidecar compares this verbatim against its --allow-origin list,
// which scripts/ports.mjs derives from the same BROWSER_ORIGIN.
const ORIGIN = BROWSER_ORIGIN;

async function readTokenValue(cssVar: string): Promise<string> {
  const css = await readFile(TOKENS_PATH, 'utf-8');
  const escaped = cssVar.replace(/-/g, '\\-');
  const re = new RegExp(`${escaped}:\\s*([^;]+);`);
  const m = css.match(re);
  if (!m) {
    throw new Error(`Could not find ${cssVar} in ${TOKENS_PATH}`);
  }
  return m[1].trim();
}

async function postApply(cssVar: string, value: string): Promise<void> {
  const response = await fetch(APPLY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
    },
    body: JSON.stringify({ tokens: { [cssVar]: value } }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`POST /apply failed (${response.status}): ${text}`);
  }
}

test.describe('zfb-tailwind — apply pipeline round-trip', () => {
  // Use --zfbtw-radius (0.5rem by default) as the test target.
  // The bin sidecar accepts any CSS var, including size tokens.
  const TARGET_VAR = '--zfbtw-radius';
  let originalValue = '';

  test.beforeAll(async () => {
    originalValue = await readTokenValue(TARGET_VAR);
  });

  test.afterAll(async () => {
    // Safety net for an abnormal exit: put the file back and PROVE it went
    // back. Swallowing a failed restore here is how `styles/global.css` ends up
    // committed with a test value in it, and how the next run's baseline is
    // read from an already-corrupted file.
    if (!originalValue) return;
    await postApply(TARGET_VAR, originalValue);
    expect(await readTokenValue(TARGET_VAR)).toBe(originalValue);
  });

  test('postApply() rewrites a token directly via the bin sidecar', async () => {
    // Prove the bin sidecar is reachable and the /apply endpoint rewrites
    // the target CSS variable in styles/global.css on disk.
    const altValue = '1.25rem';
    if (originalValue === altValue) {
      throw new Error(
        `Test value ${altValue} matches original — pick a different test value.`,
      );
    }

    await postApply(TARGET_VAR, altValue);

    await expect
      .poll(
        async () => {
          try {
            return await readTokenValue(TARGET_VAR);
          } catch {
            return '';
          }
        },
        { timeout: 5_000, intervals: [100, 250, 500] },
      )
      .toBe(altValue);

    // Restore inline as well, so the file is clean the moment this test ends
    // rather than only after the suite does.
    await postApply(TARGET_VAR, originalValue);

    await expect
      .poll(
        async () => {
          try {
            return await readTokenValue(TARGET_VAR);
          } catch {
            return '';
          }
        },
        { timeout: 5_000, intervals: [100, 250, 500] },
      )
      .toBe(originalValue);
  });
});
