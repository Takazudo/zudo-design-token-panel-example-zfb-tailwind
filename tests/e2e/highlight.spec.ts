/**
 * Every route + the panel's token-outline highlight feature.
 *
 * On each of the six prerendered routes the panel opens from the host's topbar
 * trigger with zero console errors, page errors or failed requests (the
 * `diagnostics` fixture in ./support), renders its highlight toggles, and
 * closes again leaving exactly one owned instance.
 *
 * Panel highlight architecture: each token row has a
 * `.tokenpanel-highlight-toggle` (eye icon) that outlines matching DOM
 * elements. The gear (`.tokenpanel-gear-btn`) renders directly in the header's
 * `header-right` slot (it is not folded into the "Panel actions" menu) and
 * opens `.tokenpanel-highlight-settings-popover`, whose footer carries
 * "Disable all highlights".
 */

import {
  ROUTES,
  closeViaHeader,
  expect,
  expectRoute,
  expectSinglePanelInstance,
  openViaHeader,
  panelShell,
  test,
  waitForPanelAdapter,
} from './support';

for (const { label, path } of ROUTES) {
  test(`${label} (${path}) opens the panel with highlight toggles and no errors`, async ({ page }) => {
    await page.goto(path);
    await expectRoute(page, label);
    await openViaHeader(page);
    await expectSinglePanelInstance(page, 1);
    // Toggles in inactive tab panels are display:none, so count, not visibility.
    expect(await panelShell(page).locator('.tokenpanel-highlight-toggle').count()).toBeGreaterThan(0);
    await closeViaHeader(page);
    await expectSinglePanelInstance(page, 0);
  });
}

test('a highlight toggle activates and the gear popover Disable-all clears it', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  const shell = panelShell(page);

  await shell.getByRole('tab', { name: /^spacing$/i }).click();
  const firstToggle = shell.locator('.tokenpanel-highlight-toggle:visible').first();
  await firstToggle.click();
  await expect(firstToggle).toHaveClass(/is-active/);

  await shell.locator('.tokenpanel-gear-btn').first().click();
  const settingsPopover = page.locator('.tokenpanel-highlight-settings-popover');
  await expect(settingsPopover).toBeVisible();
  await settingsPopover.getByText('Disable all highlights', { exact: true }).click();

  await expect(page.locator('.tokenpanel-highlight-toggle.is-active')).toHaveCount(0);
});

test('window.zfbTw exposes the show/hide/toggle console API', async ({ page }) => {
  await page.goto('/');
  await waitForPanelAdapter(page);

  const apiShape = await page.evaluate(() => {
    const tw = (window as unknown as { zfbTw: Record<string, unknown> }).zfbTw;
    return {
      toggle: typeof tw.toggleDesignPanel,
      show: typeof tw.showDesignPanel,
      hide: typeof tw.hideDesignPanel,
    };
  });
  expect(apiShape).toEqual({ toggle: 'function', show: 'function', hide: 'function' });
});
