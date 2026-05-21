/**
 * Highlight spec for the zfb-tailwind example.
 *
 * Verifies that the design-token panel's token-outline highlight feature
 * works on every primary route: the panel opens, highlight toggle buttons
 * are present per-token row, clicking one activates a highlight overlay,
 * and the "Disable all highlights" button in the gear settings popover
 * clears all active highlights.
 *
 * Panel highlight architecture
 * ----------------------------
 * Each token row has a `.tokenpanel-highlight-toggle` button (eye icon).
 * Clicking it activates a CSS outline overlay on matching DOM elements.
 * The gear button (`.tokenpanel-gear-btn`) opens a settings popover
 * (`.tokenpanel-highlight-settings-popover`) which contains "Disable all
 * highlights" and "Reset to defaults" buttons.
 *
 * Route inventory (6 routes):
 *   /                       → Home
 *   /prose/                 → Prose typography demo
 *   /components/forms/      → Form controls demo
 *   /components/status/     → Status indicators
 *   /components/widgets/    → Interactive widgets
 *   /components/data/       → Data components
 *
 * Prerequisites
 * -------------
 *  - zfb preview server on port 4173 (started by playwright.config.ts webServer).
 *    IMPORTANT: must be `zfb preview`, NOT `zfb dev` — dev mode does not inject
 *    the islands.js script tag so `window.zfbTw` stays undefined.
 *    See Takazudo/zudo-front-builder#377 (closed — by-design).
 */

import { test, expect } from '@playwright/test';

const STORAGE_PREFIX = 'zfb-tailwind-example-tokens';
const STORAGE_KEY_VISIBLE = `${STORAGE_PREFIX}:visible`;

const ROUTES = [
  { label: 'Home',    path: '/' },
  { label: 'Prose',   path: '/prose/' },
  { label: 'Forms',   path: '/components/forms/' },
  { label: 'Status',  path: '/components/status/' },
  { label: 'Widgets', path: '/components/widgets/' },
  { label: 'Data',    path: '/components/data/' },
] as const;

/** Open the page, seed localStorage, reload so the panel island boots eagerly. */
async function openPageWithPanel(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
  // Clear the open-state key so the panel consistently opens (not closes) when toggled.
  // Without this, leftover open-state from a previous test causes toggleDesignPanel()
  // to close the panel (willBeOpen = false), setting visible="0" and hiding the shell.
  await page.evaluate((prefix) => {
    localStorage.setItem(`${prefix}:visible`, '1');
    localStorage.removeItem(`${prefix}-open`);
  }, STORAGE_PREFIX);

  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  await page.waitForFunction(
    () => typeof (window as unknown as { zfbTw?: { toggleDesignPanel?: unknown } }).zfbTw?.toggleDesignPanel === 'function',
    { timeout: 20_000 },
  );

  // Use showDesignPanel (not toggleDesignPanel) to always open — avoids closing
  // the panel when leftover open-state from a previous test makes toggle close it.
  await page.evaluate(async () => {
    const win = window as unknown as { zfbTw: { showDesignPanel: () => Promise<void> } };
    await win.zfbTw.showDesignPanel();
  });

  // Wait for the panel shell to be visible. The toggles are in the DOM but may be
  // inside inactive tab panels (display:none in inactive tabs). Assert the shell
  // is present and the content is rendered (children > 0 means open===true).
  await page.locator('.tokenpanel-shell').waitFor({ state: 'visible', timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Route tests — panel opens and highlight toggles are present
// ---------------------------------------------------------------------------

test.describe('zfb-tailwind — highlight: panel toggles on every primary route', () => {
  for (const route of ROUTES) {
    test(`${route.label} route (${route.path}): panel opens, highlight toggles present`, async ({ page }) => {
      await openPageWithPanel(page, route.path);

      // Assert the panel shell is visible (open=true via useEffect).
      await expect(page.locator('.tokenpanel-shell')).toBeVisible({ timeout: 5_000 });

      // Assert highlight toggle buttons exist (one per token row in the DOM).
      // Toggles may be in inactive tab panels (display:none) — count() is sufficient;
      // isVisible() would fail for toggles in inactive tabs.
      const toggles = page.locator('.tokenpanel-highlight-toggle');
      const toggleCount = await toggles.count();
      expect(toggleCount).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Full highlight → disable-all round-trip (on Home route)
// ---------------------------------------------------------------------------

test.describe('zfb-tailwind — highlight: activate + disable-all via gear popover', () => {
  test('clicking a highlight toggle activates overlay; gear popover Disable-all clears it', async ({ page }) => {
    await openPageWithPanel(page, '/');

    // Step 1: click the first visible highlight toggle to activate it.
    // Toggles in inactive tab panels are display:none. Navigate to the Spacing tab
    // to find a visible toggle (Spacing is the first tab in the manifest, default
    // active varies by config — use the tab-click to ensure a known active tab).
    const spacingTab = page.getByRole('tab', { name: /spacing/i });
    await spacingTab.waitFor({ state: 'visible', timeout: 10_000 });
    await spacingTab.click();

    // Now find the first visible highlight toggle in the Spacing tab.
    const firstToggle = page.locator('.tokenpanel-highlight-toggle:visible').first();
    await firstToggle.waitFor({ state: 'visible', timeout: 10_000 });
    await firstToggle.click();

    // Step 2: assert the toggle gained the is-active modifier class.
    await expect(firstToggle).toHaveClass(/is-active/, { timeout: 3_000 });

    // Step 3: open the gear settings popover.
    const gearBtn = page.locator('.tokenpanel-gear-btn').first();
    await gearBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await gearBtn.click();

    // Step 4: wait for the settings popover to appear.
    const settingsPopover = page.locator('.tokenpanel-highlight-settings-popover');
    await settingsPopover.waitFor({ state: 'visible', timeout: 5_000 });

    // Step 5: click "Disable all highlights".
    const disableAllBtn = page.getByText('Disable all highlights').first();
    await disableAllBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await disableAllBtn.click();

    // Step 6: assert no highlight toggles are active.
    await expect(page.locator('.tokenpanel-highlight-toggle.is-active')).toHaveCount(0, { timeout: 3_000 });
  });
});

// ---------------------------------------------------------------------------
// window.zfbTw console API
// ---------------------------------------------------------------------------

test.describe('zfb-tailwind — highlight: window.zfbTw console API available on home', () => {
  test('window.zfbTw is defined and has toggleDesignPanel', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate((key) => {
      localStorage.setItem(key, '1');
    }, STORAGE_KEY_VISIBLE);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await page.waitForFunction(
      () => typeof (window as unknown as { zfbTw?: { toggleDesignPanel?: unknown } }).zfbTw?.toggleDesignPanel === 'function',
      { timeout: 20_000 },
    );

    const apiShape = await page.evaluate(() => {
      const tw = (window as unknown as { zfbTw: Record<string, unknown> }).zfbTw;
      return {
        hasToggle: typeof tw.toggleDesignPanel === 'function',
        hasShow: typeof tw.showDesignPanel === 'function',
        hasHide: typeof tw.hideDesignPanel === 'function',
      };
    });

    expect(apiShape.hasToggle).toBe(true);
    expect(apiShape.hasShow).toBe(true);
    expect(apiShape.hasHide).toBe(true);
  });
});
