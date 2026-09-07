/**
 * Shared panel-storage helpers for the e2e specs.
 *
 * The panel namespaces every persisted entry under `storagePrefix`
 * (`config/panel-config.ts`). Beyond `:visible` that covers the `-state-*`
 * override records and, since zdtp 0.4.15, the UI preference keys — dock mode,
 * position, size, density, specimen, spawn ordinal. Enumerating by prefix is
 * therefore the only sweep that stays correct as the package adds keys; a
 * hard-coded key list silently stops clearing whatever ships next.
 */

import type { Page } from '@playwright/test';

/** Must match `panelConfig.storagePrefix` in `config/panel-config.ts`. */
export const STORAGE_PREFIX = 'zfb-tailwind-example-tokens';

/** The one key the specs write themselves to force the panel open. */
export const STORAGE_KEY_VISIBLE = `${STORAGE_PREFIX}:visible`;

/** Open the panel on the next load by seeding the visible flag. */
export async function setPanelVisibleFlag(page: Page): Promise<void> {
  await page.evaluate((key) => {
    localStorage.setItem(key, '1');
  }, STORAGE_KEY_VISIBLE);
}

/**
 * Remove every localStorage and sessionStorage entry the panel owns.
 *
 * Playwright's default `page` fixture hands each test a fresh browser context,
 * so this is not what isolates one test from the next — it is what keeps a
 * reused context honest: `--repeat-each`, a hand-run `test.use({ storageState })`,
 * or any later spec that opens two pages in one context.
 *
 * Call this AFTER the panel-close click, never before: closing writes its own
 * keys back (`:visible` -> '0', the open-state record), so a sweep that runs
 * first leaves behind exactly the entries it promised to remove.
 */
export async function clearPanelStorage(page: Page): Promise<void> {
  await page.evaluate((prefix) => {
    for (const store of [window.localStorage, window.sessionStorage]) {
      // Collect first, then remove. Removing during the index walk shifts the
      // remaining keys down by one and skips every other match.
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key !== null && key.startsWith(prefix)) doomed.push(key);
      }
      for (const key of doomed) store.removeItem(key);
    }
  }, STORAGE_PREFIX);
}

/**
 * Close the panel if its close button is on screen, then sweep every key it
 * owns. Ordering matters — see `clearPanelStorage`.
 */
export async function closePanelAndClearStorage(page: Page): Promise<void> {
  const closeBtn = page.locator('.tokenpanel-close-btn').first();
  if (await closeBtn.isVisible()) await closeBtn.click();
  await clearPanelStorage(page);
}
