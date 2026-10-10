/**
 * "Change a token in the panel → a visible element's computed style updates."
 *
 * Every edit goes through the panel UI (opened with the host's topbar
 * trigger) and lands on the authored `--zfbtw-*` variable. Wind utilities
 * reach it through the `--zw-*` chain zfb.config.ts registers:
 *
 *   panel → --zfbtw-vsp-lg → --zw-spacing-vsp-lg → `.gap-vsp-lg { gap }`
 *
 * so asserting the computed style of a utility-styled element proves the whole
 * chain, not just the `:root` write. Each assertion pins the concrete value the
 * cascade must land on rather than "it changed": a "changed" assertion passes
 * when a value moves for an unrelated reason. The figures assume the default
 * 16px root font size.
 *
 * Each test gets a fresh browser context, so no panel state leaks between
 * tests; nothing here touches the apply sidecar or the file on disk.
 */

import type { Page } from '@playwright/test';
import { expect, openViaHeader, panelShell, setLengthToken, test } from './support';

async function setColorToken(page: Page, cssVar: string, hex: string): Promise<void> {
  const shell = panelShell(page);
  await shell.getByRole('tab', { name: /^color$/i }).click();
  await shell.locator(`[aria-label^="${cssVar}:"]`).click();
  const hexInput = page.locator('.tokenpanel-color-picker-hex-input');
  await hexInput.fill(hex);
  await hexInput.press('Enter');
}

test('font scale: --zfbtw-scale-xs resizes .text-scale-xs text', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  const text = page.locator('.text-scale-xs').first();
  await expect(text).toHaveCSS('font-size', '12px');

  await setLengthToken(page, /^font$/i, '--zfbtw-scale-xs', '0.625');

  await expect(text).toHaveCSS('font-size', '10px');
});

test('spacing: --zfbtw-vsp-lg changes the gap-vsp-lg gap', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  const stack = page.locator('main .gap-vsp-lg').first();
  await expect(stack).toHaveCSS('row-gap', '28px');

  await setLengthToken(page, /^spacing$/i, '--zfbtw-vsp-lg', '2.5');

  await expect(stack).toHaveCSS('row-gap', '40px');
  await expect(stack).toHaveCSS('column-gap', '40px');
});

test('spacing: --zfbtw-hsp-md changes the px-hsp-md padding', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  const padded = page.locator('.px-hsp-md').first();
  await expect(padded).toHaveCSS('padding-left', '16px');

  await setLengthToken(page, /^spacing$/i, '--zfbtw-hsp-md', '2');

  await expect(padded).toHaveCSS('padding-left', '32px');
  await expect(padded).toHaveCSS('padding-right', '32px');
});

test('color: --zfbtw-palette-1 repaints the text-primary page title', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  const title = page.locator('main h1.text-primary').first();
  await expect(title).toHaveCSS('color', 'rgb(45, 108, 223)');

  await setColorToken(page, '--zfbtw-palette-1', '#ff0000');

  await expect(title).toHaveCSS('color', 'rgb(255, 0, 0)');
});

test('color: --zfbtw-palette-0 repaints its home-page swatch', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  const swatch = page.locator('main [style*="--zfbtw-palette-0)"]').first();
  await expect(swatch).toHaveCSS('background-color', 'rgb(30, 30, 30)');

  await setColorToken(page, '--zfbtw-palette-0', '#ee1111');

  await expect(swatch).toHaveCSS('background-color', 'rgb(238, 17, 17)');
});
