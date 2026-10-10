import { test, expect } from '@playwright/test';
import { closePanelAndClearStorage } from './panel-storage';

test('production navigation retains chrome and remounts interactive islands', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).zfbTw?.showDesignPanel === 'function');
  await page.evaluate(() => {
    (window as any).__navigationProbe = {
      header: document.querySelector('header'),
      aside: document.querySelector('aside'),
      swaps: 0,
    };
    document.addEventListener('zfb:after-swap', () => {
      (window as any).__navigationProbe.swaps += 1;
    });
  });

  for (let visit = 0; visit < 2; visit += 1) {
    await page.locator('aside').getByRole('link', { name: 'Widgets', exact: true }).click();
    await expect(page).toHaveURL(/\/components\/widgets\/$/);
    const overview = page.getByRole('tab', { name: 'Overview', exact: true });
    await expect(overview).toHaveAttribute('aria-selected', 'true');
    await overview.focus();
    await page.keyboard.press('ArrowRight');
    const details = page.getByRole('tab', { name: 'Details', exact: true });
    await expect(details).toBeFocused();
    await expect(details).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'Details', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Open Modal', exact: true }).click();
    await expect(page.locator('dialog')).toHaveAttribute('open', '');
    await expect(page.locator('main')).toHaveAttribute('inert', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).not.toHaveAttribute('open', '');
    await expect(page.locator('main')).not.toHaveAttribute('inert', '');

    await page.locator('aside').getByRole('link', { name: 'Forms', exact: true }).click();
    await expect(page).toHaveURL(/\/components\/forms\/$/);
    await page.locator('#input-text').fill('Published ZFB 4.3.0');
    await expect(page.locator('#input-text')).toHaveValue('Published ZFB 4.3.0');
    await page.locator('#cb-tokens').check();
    await expect(page.locator('#cb-tokens')).toBeChecked();

    await page.locator('#zfbtw-panel-open').click();
    await expect(page.locator('.tokenpanel-shell')).toBeVisible();
    await expect(page.locator('.tokenpanel-shell')).toHaveCount(1);
    await closePanelAndClearStorage(page);
  }

  await page.goBack();
  await expect(page).toHaveURL(/\/components\/widgets\/$/);
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => page.evaluate(() => {
    const probe = (window as any).__navigationProbe;
    return {
      header: probe?.header === document.querySelector('header'),
      aside: probe?.aside === document.querySelector('aside'),
      swaps: probe?.swaps,
    };
  })).toEqual({ header: true, aside: true, swaps: 5 });
  expect(errors).toEqual([]);
});
