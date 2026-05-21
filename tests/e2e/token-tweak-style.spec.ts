/**
 * Token-tweak-style spec for the zfb-tailwind example.
 *
 * Exercises the panel's live-tweak pipeline end-to-end for three token
 * categories: font-scale, spacing, and palette color.
 *
 * Tailwind cascade consideration
 * --------------------------------
 * zfb-tailwind re-exports spacing tokens via `@theme` so that Tailwind
 * generates utility classes:
 *
 *   CSS var:   --zfbtw-hsp-md: 1rem
 *   @theme:    --spacing-hsp-md: var(--zfbtw-hsp-md)
 *   Utility:   px-hsp-md → padding-left/right: var(--spacing-hsp-md)
 *
 * The panel tweaks `--zfbtw-hsp-md` (raw var) on :root. Tailwind's
 * @theme vars (--spacing-hsp-md) cascade from the raw var, and the utility
 * classes resolve through that chain. Assertions target computed style values
 * (not var() strings) so they verify the full cascade.
 *
 * Spacing cascade assertion (acceptance criteria from sub-issue #252):
 *   1. Find an element whose gap is driven by a `gap-vsp-*` utility class
 *      (home page flex container uses `gap-vsp-lg`).
 *   2. Tweak `--zfbtw-vsp-lg` via the panel's Spacing tab.
 *   3. Assert the element's computed `gap` updates to the new value, proving:
 *      panel → --zfbtw-vsp-lg → --spacing-vsp-lg → gap-vsp-lg utility.
 *
 * Panel input selectors
 * ----------------------
 * Spacing token rows expose aria-label patterns:
 *   "--zfbtw-vsp-lg value"  → text input for the numeric value
 *   "--zfbtw-vsp-lg slider" → range slider
 * Color palette swatches are role="button" divs (tokenpanel-color-swatch-button)
 * with aria-label "--zfbtw-palette-N: #hexvalue". Tweaking via the :root CSS var
 * override mechanism is validated via computed style assertions.
 *
 * Prerequisites
 * -------------
 *  - zfb preview server on port 4173 (started by playwright.config.ts webServer).
 *    IMPORTANT: must be `zfb preview`, NOT `zfb dev`.
 *    See Takazudo/zudo-front-builder#377 (closed — by-design).
 */

import { test, expect } from '@playwright/test';

const STORAGE_PREFIX = 'zfb-tailwind-example-tokens';

/** Open the page, seed localStorage, reload so the panel island boots eagerly. */
async function openPageWithPanel(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
  // Clear open-state key to avoid leftover state from previous tests toggling the panel
  // CLOSED instead of open (wasVisible=true but isPanelCurrentlyOpen=true → willBeOpen=false).
  await page.evaluate((prefix) => {
    localStorage.setItem(`${prefix}:visible`, '1');
    localStorage.removeItem(`${prefix}-open`);
  }, STORAGE_PREFIX);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // Wait for window.zfbTw.showDesignPanel to be available.
  await page.waitForFunction(
    () => typeof (window as unknown as { zfbTw?: { showDesignPanel?: unknown } }).zfbTw?.showDesignPanel === 'function',
    { timeout: 20_000 },
  );

  // Use showDesignPanel (not toggle) to always open the panel.
  await page.evaluate(async () => {
    const win = window as unknown as { zfbTw: { showDesignPanel: () => Promise<void> } };
    await win.zfbTw.showDesignPanel();
  });

  // Wait for panel shell to be visible (open=true via useEffect).
  await page.locator('.tokenpanel-shell').waitFor({ state: 'visible', timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Font-scale tweak
// ---------------------------------------------------------------------------

test.describe('zfb-tailwind — token-tweak: font-scale', () => {
  test('tweaking --zfbtw-scale-xs via value input changes computed font-size', async ({ page }) => {
    await openPageWithPanel(page, '/');

    // Open the Font tab.
    const fontTab = page.getByRole('tab', { name: /font/i });
    await fontTab.waitFor({ state: 'visible', timeout: 10_000 });
    await fontTab.click();

    // Panel uses aria-label pattern: "--zfbtw-scale-xs value" for the number input.
    // Default value: 0.75rem.
    const scaleXsInput = page.getByLabel('--zfbtw-scale-xs value');
    await scaleXsInput.waitFor({ state: 'visible', timeout: 5_000 });

    // On the home page, palette swatch labels use text-annotation (→ --zfbtw-text-annotation
    // → --zfbtw-scale-xs via the semantic tier). The raw scale row also renders
    // `<p class="text-scale-xs text-muted">` directly consuming --zfbtw-scale-xs.
    const xsTextEl = page.locator('.text-scale-xs').first();

    const beforeSize = await xsTextEl.evaluate((el) => {
      return window.getComputedStyle(el).fontSize;
    });

    // Set to a clearly different value (0.625rem = 10px).
    await scaleXsInput.fill('0.625');
    await scaleXsInput.press('Enter');

    await expect
      .poll(
        async () => {
          return xsTextEl.evaluate((el) => window.getComputedStyle(el).fontSize);
        },
        { timeout: 5_000, intervals: [100, 250, 500] },
      )
      .not.toBe(beforeSize);

    // Restore original value.
    await scaleXsInput.fill('0.75');
    await scaleXsInput.press('Enter');
  });
});

// ---------------------------------------------------------------------------
// Spacing tweak — Tailwind cascade: --zfbtw-vsp-lg → --spacing-vsp-lg → gap-vsp-lg
// ---------------------------------------------------------------------------

test.describe('zfb-tailwind — token-tweak: spacing (Tailwind @theme cascade)', () => {
  test('tweaking --zfbtw-vsp-lg updates computed gap on gap-vsp-lg element', async ({ page }) => {
    await openPageWithPanel(page, '/');

    // Open the Spacing tab.
    const spacingTab = page.getByRole('tab', { name: /spacing/i });
    await spacingTab.waitFor({ state: 'visible', timeout: 10_000 });
    await spacingTab.click();

    // Panel aria-label: "--zfbtw-vsp-lg value" (text number input).
    // Default: 1.75rem.
    const vspLgInput = page.getByLabel('--zfbtw-vsp-lg value');
    await vspLgInput.waitFor({ state: 'visible', timeout: 5_000 });

    // Home page: <div class="flex flex-col gap-vsp-lg max-w-[56rem] mx-auto">
    // cascade: gap-vsp-lg → gap: var(--spacing-vsp-lg) → var(--zfbtw-vsp-lg) → 1.75rem
    const gapEl = page.locator('.gap-vsp-lg').first();

    const beforeGap = await gapEl.evaluate((el) => {
      return window.getComputedStyle(el).gap;
    });

    // Tweak to 2.5rem — clearly different from the default 1.75rem.
    await vspLgInput.fill('2.5');
    await vspLgInput.press('Enter');

    // Assert the computed gap changed (full cascade: panel → CSS var → Tailwind @theme → utility).
    await expect
      .poll(
        async () => {
          return gapEl.evaluate((el) => window.getComputedStyle(el).gap);
        },
        { timeout: 5_000, intervals: [100, 250, 500] },
      )
      .not.toBe(beforeGap);

    // Restore.
    await vspLgInput.fill('1.75');
    await vspLgInput.press('Enter');
  });

  test('tweaking --zfbtw-hsp-md updates computed padding on px-hsp-md element', async ({ page }) => {
    await openPageWithPanel(page, '/');

    // Open the Spacing tab.
    const spacingTab = page.getByRole('tab', { name: /spacing/i });
    await spacingTab.waitFor({ state: 'visible', timeout: 10_000 });
    await spacingTab.click();

    // Panel aria-label: "--zfbtw-hsp-md value". Default: 1rem.
    const hspMdInput = page.getByLabel('--zfbtw-hsp-md value');
    await hspMdInput.waitFor({ state: 'visible', timeout: 5_000 });

    // Home page cards use `px-hsp-md`:
    //   px-hsp-md → padding-inline: var(--spacing-hsp-md) → var(--zfbtw-hsp-md) → 1rem
    const cardEl = page.locator('.px-hsp-md').first();

    const beforePadding = await cardEl.evaluate((el) => {
      return window.getComputedStyle(el).paddingLeft;
    });

    // Tweak to 2rem.
    await hspMdInput.fill('2');
    await hspMdInput.press('Enter');

    await expect
      .poll(
        async () => {
          return cardEl.evaluate((el) => window.getComputedStyle(el).paddingLeft);
        },
        { timeout: 5_000, intervals: [100, 250, 500] },
      )
      .not.toBe(beforePadding);

    // Restore.
    await hspMdInput.fill('1');
    await hspMdInput.press('Enter');
  });
});

// ---------------------------------------------------------------------------
// Palette color tweak
// ---------------------------------------------------------------------------

test.describe('zfb-tailwind — token-tweak: palette color', () => {
  test('tweaking --zfbtw-palette-0 via :root override changes computed background on swatch', async ({ page }) => {
    await openPageWithPanel(page, '/');

    // Open the Color tab.
    const colorTab = page.getByRole('tab', { name: /color/i });
    await colorTab.waitFor({ state: 'visible', timeout: 10_000 });
    await colorTab.click();

    // The panel sets :root overrides directly when tweaking tokens.
    // Read the current value of --zfbtw-palette-0 from :root (default: #1e1e1e).
    const beforeColor = await page.evaluate(() => {
      return window.getComputedStyle(document.documentElement)
        .getPropertyValue('--zfbtw-palette-0').trim();
    });

    // The home page renders palette swatches with inline style:
    //   style="background: var(--zfbtw-palette-0); ..."
    const swatch0 = page.locator('[style*="--zfbtw-palette-0"]').first();
    const beforeBg = await swatch0.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Tweak via the panel's color swatch button — click to open the color picker,
    // then set a known hex value via the hex input in the picker.
    // The swatch button for palette-0 has aria-label "--zfbtw-palette-0: #1e1e1e".
    const swatch0Btn = page.locator('.tokenpanel-color-swatch-button').first();
    await swatch0Btn.waitFor({ state: 'visible', timeout: 5_000 });
    await swatch0Btn.click();

    // Wait for the color picker to appear and find the hex input.
    // The color picker renders a hex input with class tokenpanel-colorpicker-hex-input
    // or similar. Check for an input inside the color picker.
    // The color picker's hex input has class "tokenpanel-color-picker-hex-input"
    // and aria-label "Hex color value".
    const hexInput = page.locator('.tokenpanel-color-picker-hex-input').first();
    await hexInput.waitFor({ state: 'visible', timeout: 5_000 });

    // Fill in a clearly different color. The hex input requires "#RRGGBB" format
    // to trigger the color commit via handleHexChange.
    await hexInput.fill('#ee1111');
    // Trigger the input event by pressing a key to re-fire onChange.
    await hexInput.dispatchEvent('input');

    // Assert the CSS variable on :root changed.
    await expect
      .poll(
        async () => {
          return page.evaluate(() =>
            window.getComputedStyle(document.documentElement)
              .getPropertyValue('--zfbtw-palette-0').trim(),
          );
        },
        { timeout: 5_000, intervals: [100, 250, 500] },
      )
      .not.toBe(beforeColor);

    // Assert the swatch computed background changed.
    const afterBg = await swatch0.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(afterBg).not.toBe(beforeBg);

    // Close the color picker by clicking outside.
    await page.keyboard.press('Escape');
  });

  test('--zfbtw-palette-1 CSS var on :root reflects panel tweak', async ({ page }) => {
    await openPageWithPanel(page, '/');

    // Open the Color tab.
    const colorTab = page.getByRole('tab', { name: /color/i });
    await colorTab.waitFor({ state: 'visible', timeout: 10_000 });
    await colorTab.click();

    // Read initial value of --zfbtw-palette-1 (default: #2d6cdf).
    const beforeColor = await page.evaluate(() => {
      return window.getComputedStyle(document.documentElement)
        .getPropertyValue('--zfbtw-palette-1').trim();
    });

    // Click the second swatch button (palette-1).
    const swatch1Btn = page.locator('.tokenpanel-color-swatch-button').nth(1);
    await swatch1Btn.waitFor({ state: 'visible', timeout: 5_000 });
    await swatch1Btn.click();

    // Find the hex input in the color picker.
    // The color picker's hex input has class "tokenpanel-color-picker-hex-input"
    // and aria-label "Hex color value".
    const hexInput = page.locator('.tokenpanel-color-picker-hex-input').first();
    await hexInput.waitFor({ state: 'visible', timeout: 5_000 });

    // Set to a clearly different color. The hex input requires "#RRGGBB" format.
    await hexInput.fill('#ff0044');
    await hexInput.dispatchEvent('input');

    // Assert the CSS var on :root changed.
    await expect
      .poll(
        async () => {
          return page.evaluate(() =>
            window.getComputedStyle(document.documentElement)
              .getPropertyValue('--zfbtw-palette-1').trim(),
          );
        },
        { timeout: 5_000, intervals: [100, 250, 500] },
      )
      .not.toBe(beforeColor);

    await page.keyboard.press('Escape');
  });
});
