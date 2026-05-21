/**
 * Apply-pipeline round-trip spec for the zfb-tailwind example.
 *
 * Exercises the bin sidecar (`design-token-panel-server`) apply endpoint
 * directly via fetch(), proving the full bin → CSS file rewrite path.
 *
 * Panel-driven Apply is NOT tested here.
 * ----------------------------------------
 * The panel's Apply modal (`apply-modal.tsx`) only includes *color* token
 * diffs in its payload — spacing, typography, and size overrides are
 * deliberately excluded (see `src/apply/build-apply-overrides.ts`). Tweaking
 * a size token like `--zfbtw-radius` and clicking Apply leaves the modal's
 * primary button `aria-disabled="true"` (`isEmpty=true`). A panel-level fix
 * to include non-color overrides in the Apply payload is tracked upstream in
 * the `@takazudo/zudo-design-token-panel` package.
 *
 * Prerequisites
 * -------------
 *  - zfb preview server on port 4173 (started by playwright.config.ts webServer).
 *    IMPORTANT: must be `zfb preview`, NOT `zfb dev`.
 *    See Takazudo/zudo-front-builder#377 (closed — by-design).
 *  - Bin sidecar `design-token-panel-server` on port 24686, with:
 *      --write-root .
 *      --routing scaffold.routing.json
 *      --allow-origin http://localhost:44328
 *    The apply-roundtrip spec drives fetch() directly against the bin sidecar
 *    rather than routing through the zfb dev-apply-proxy, because the preview
 *    server does not expose the /api/dev/apply endpoint (dev-only).
 *
 * Token path
 * ----------
 * `scaffold.routing.json`: { "zfbtw": "styles/global.css" }
 * The bin writes the updated token to `styles/global.css` in the repo root.
 *
 * Try/finally restores the original token value so re-running the spec is
 * idempotent. The afterAll hook best-effort restores even if the main test
 * assertion fails.
 *
 * Bin sidecar port
 * ----------------
 * Port 24686 (zfb-tailwind demo's bin port — offset +1 from the plain zfb
 * demo on 24685 to avoid collision when both run simultaneously).
 */

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// styles/global.css is two levels up from tests/e2e/.
const TOKENS_PATH = resolve(__dirname, '..', '..', 'styles', 'global.css');

// The bin sidecar runs on port 24686 for the zfb-tailwind demo.
// When running this spec in isolation (no live bin sidecar), start it via:
//   pnpm exec design-token-panel-server --write-root . --routing scaffold.routing.json --port 24686 --allow-origin http://localhost:44328
const APPLY_URL = 'http://127.0.0.1:24686/apply';
// The preview server's origin (used for CORS allow-origin header matching).
// The bin sidecar configured with `--allow-origin http://localhost:44328` (dev origin).
// For the apply POST, send the dev origin so the sidecar accepts it.
const ORIGIN = 'http://localhost:44328';

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
    // Restore the original token value via the bin so the file on disk lands
    // in a known-good state regardless of how the test exited.
    if (originalValue) {
      try {
        await postApply(TARGET_VAR, originalValue);
      } catch {
        // Best-effort restoration — the in-band assertion already failed if
        // we get here; surfacing the secondary error would mask the primary.
      }
    }
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

    // Restore immediately (afterAll is a safety net; restore inline too so
    // the file on disk is clean even if the test runner exits abnormally).
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
