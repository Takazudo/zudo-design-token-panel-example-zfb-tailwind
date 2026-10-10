/**
 * Navigation + panel ownership/lifecycle on the ZFB + Wind host.
 *
 * This host mounts zfb's `<ClientRouter />` (components/app-shell.tsx), so a
 * sidenav click and browser back/forward are client-side swaps: the document
 * survives, the topbar and sidenav are byte-moved (`data-zfb-transition-persist`)
 * and zfb fires `zfb:before-swap` / `zfb:after-swap`, which PanelMount hands to
 * the panel through `setLifecycleAdapter`. The specs prove the swap rather than
 * assume it — a `window.__marker` set before navigating must survive, and the
 * after-swap counter must advance once per navigation. Persistence is then
 * tested across swaps, history traversal and a real reload.
 *
 * Lifecycle: the panel is opened/closed only through the host's topbar
 * trigger, and after every navigation and toggle the page holds exactly one
 * owned panel instance (one root, one set of document-level mounts, one
 * stylesheet).
 */

import type { Page } from '@playwright/test';
import {
  ROUTES,
  closeViaHeader,
  expect,
  expectPersistedOverride,
  expectRoute,
  expectSinglePanelInstance,
  navigateViaSidenav,
  openViaHeader,
  panelShell,
  setLengthToken,
  test,
} from './support';

type ProbedWindow = Window & { __marker?: number; __swaps?: number };

/** Marks the current document and starts counting `zfb:after-swap`. */
async function installSwapProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as ProbedWindow;
    win.__marker = 1;
    win.__swaps = 0;
    document.addEventListener('zfb:after-swap', () => {
      win.__swaps = (win.__swaps ?? 0) + 1;
    });
  });
}

/** Same document as when the probe was installed, after `swaps` client swaps. */
async function expectClientSwaps(page: Page, swaps: number): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const win = window as ProbedWindow;
        return { marker: win.__marker, swaps: win.__swaps };
      }),
    )
    .toEqual({ marker: 1, swaps });
}

// Home first, then every other route and back to Home: the visit order the
// open/close test walks once per round (so it also ends each round on Home).
const HISTORY = [...ROUTES.map(({ label }) => label), 'Home'] as const;

const activeLink = (page: Page) => page.locator('aside a.font-semibold');

test('sidenav navigation and back/forward are client-side swaps that keep one open panel', async ({
  page,
}) => {
  await page.goto('/');
  await expectRoute(page, 'Home');
  await installSwapProbe(page);
  await openViaHeader(page);

  let swaps = 0;
  for (const { label } of ROUTES.slice(1)) {
    await navigateViaSidenav(page, label);
    await expectClientSwaps(page, (swaps += 1));
    await expect(panelShell(page)).toBeVisible();
    await expectSinglePanelInstance(page, 1);
  }

  await page.goBack();
  await expectRoute(page, 'Widgets');
  await expectClientSwaps(page, (swaps += 1));
  await expectSinglePanelInstance(page, 1);

  await page.goBack();
  await expectRoute(page, 'Status');
  await expectClientSwaps(page, (swaps += 1));
  await expectSinglePanelInstance(page, 1);

  await page.goForward();
  await expectRoute(page, 'Widgets');
  await expectClientSwaps(page, (swaps += 1));
  await expect(panelShell(page)).toBeVisible();
  await expectSinglePanelInstance(page, 1);
});

test('repeated open/close across all six routes never duplicates the panel', async ({ page }) => {
  await page.goto('/');
  await expectRoute(page, 'Home');
  await installSwapProbe(page);
  await openViaHeader(page);

  let swaps = 0;
  for (let round = 0; round < 2; round += 1) {
    for (const label of HISTORY.slice(1)) {
      await navigateViaSidenav(page, label);
      await expectClientSwaps(page, (swaps += 1));
      await expectSinglePanelInstance(page, 1);
      await closeViaHeader(page);
      await expectSinglePanelInstance(page, 0);
      await openViaHeader(page);
      await expectSinglePanelInstance(page, 1);
    }
  }

  // History traversal over the same stack keeps the single owned instance.
  for (let step = 0; step < 3; step += 1) {
    await page.goBack();
    await expectRoute(page, HISTORY[HISTORY.length - 2 - step]);
    await expectClientSwaps(page, (swaps += 1));
    await expectSinglePanelInstance(page, 1);
  }
  for (let step = 0; step < 3; step += 1) {
    await page.goForward();
    await expectRoute(page, HISTORY[HISTORY.length - 3 + step]);
    await expectClientSwaps(page, (swaps += 1));
    await expectSinglePanelInstance(page, 1);
  }
});

test('panel visibility persists across swaps, history and reload', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);

  await page.reload();
  await expectRoute(page, 'Home');
  await expect(panelShell(page)).toBeVisible();
  await expectSinglePanelInstance(page, 1);

  await closeViaHeader(page);
  await navigateViaSidenav(page, 'Forms');
  await expect(panelShell(page)).toHaveCount(0);

  await page.reload();
  await expectRoute(page, 'Forms');
  await expect(panelShell(page)).toHaveCount(0);

  await page.goBack();
  await expectRoute(page, 'Home');
  await expect(panelShell(page)).toHaveCount(0);

  await openViaHeader(page);
  await page.goForward();
  await expectRoute(page, 'Forms');
  await expect(panelShell(page)).toBeVisible();
  await expectSinglePanelInstance(page, 1);
});

test('a token edit persists across swaps, history and reload', async ({ page }) => {
  await page.goto('/');
  await expect(activeLink(page)).toHaveCSS('border-top-left-radius', '8px');
  await openViaHeader(page);

  await setLengthToken(page, /^size$/i, '--zfbtw-radius', '1.25');
  await expect(activeLink(page)).toHaveCSS('border-top-left-radius', '20px');
  // Like visibility, the override is persisted after render; navigate only
  // once a stored state envelope carries it.
  await expectPersistedOverride(page, '1.25rem');

  await navigateViaSidenav(page, 'Data');
  await expect(activeLink(page)).toHaveCSS('border-top-left-radius', '20px');

  await closeViaHeader(page);
  await navigateViaSidenav(page, 'Prose');
  await expect(activeLink(page)).toHaveCSS('border-top-left-radius', '20px');
  await expect(panelShell(page)).toHaveCount(0);

  await page.goBack();
  await expectRoute(page, 'Data');
  await expect(activeLink(page)).toHaveCSS('border-top-left-radius', '20px');

  // A real document load: restored from storage with the panel closed.
  await page.reload();
  await expectRoute(page, 'Data');
  await expect(activeLink(page)).toHaveCSS('border-top-left-radius', '20px');
  await expectSinglePanelInstance(page, 0);
});

test('client swaps keep the persisted chrome and remount the page islands', async ({ page }) => {
  await page.goto('/');
  await expectRoute(page, 'Home');
  await installSwapProbe(page);
  await page.evaluate(() => {
    const probe = window as unknown as { __chrome: { header: Element | null; aside: Element | null } };
    probe.__chrome = {
      header: document.querySelector('header'),
      aside: document.querySelector('aside'),
    };
  });

  let swaps = 0;
  for (let visit = 0; visit < 2; visit += 1) {
    await navigateViaSidenav(page, 'Widgets');
    await expectClientSwaps(page, (swaps += 1));
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

    await navigateViaSidenav(page, 'Forms');
    await expectClientSwaps(page, (swaps += 1));
    await page.locator('#input-text').fill('Published ZFB 4.3.0');
    await expect(page.locator('#input-text')).toHaveValue('Published ZFB 4.3.0');
    await page.locator('#cb-tokens').check();
    await expect(page.locator('#cb-tokens')).toBeChecked();

    await openViaHeader(page);
    await expectSinglePanelInstance(page, 1);
    await closeViaHeader(page);
  }

  await page.goBack();
  await expectRoute(page, 'Widgets');
  await expectClientSwaps(page, (swaps += 1));
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(
    await page.evaluate(() => {
      const probe = window as unknown as { __chrome: { header: Element | null; aside: Element | null } };
      return {
        header: probe.__chrome.header === document.querySelector('header'),
        aside: probe.__chrome.aside === document.querySelector('aside'),
      };
    }),
  ).toEqual({ header: true, aside: true });
});
