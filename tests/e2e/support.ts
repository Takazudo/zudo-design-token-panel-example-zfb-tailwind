/**
 * Shared constants, the error-gated `test` fixture, and panel helpers for the
 * ZFB + Wind example's browser suite.
 *
 * Every spec imports `test` / `expect` from here, not from `@playwright/test`,
 * so the auto `diagnostics` fixture runs on every page of every test: any
 * console error, uncaught page error, failed request, or HTTP >= 400 response
 * on any visited route fails that test.
 *
 * Each test gets a fresh browser context, so no panel state (localStorage /
 * sessionStorage) leaks between tests.
 */

import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER_ORIGIN, ZDTP_PORT } from '../../scripts/ports.mjs';
export { expect };

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
// scaffold.routing.json maps prefix `zfbtw` → this file.
export const TOKENS_PATH = resolve(REPO_ROOT, 'styles', 'global.css');
export const ORIGIN = BROWSER_ORIGIN;
export const SIDECAR_ORIGIN = `http://127.0.0.1:${ZDTP_PORT}`;

// The six prerendered routes, keyed by sidenav label. Titles are the full
// <title> text from each pages/*.tsx; the dashes are U+2014.
export const ROUTES = [
  { label: 'Home', path: '/', title: 'ZFB + Wind Example — Design Token Panel' },
  { label: 'Prose', path: '/prose/', title: 'Prose Demo — ZFB + Wind — Design Token Panel' },
  { label: 'Forms', path: '/components/forms/', title: 'Forms — ZFB + Wind — Design Token Panel' },
  { label: 'Status', path: '/components/status/', title: 'Status — ZFB + Wind — Design Token Panel' },
  { label: 'Widgets', path: '/components/widgets/', title: 'Widgets — ZFB + Wind — Design Token Panel' },
  { label: 'Data', path: '/components/data/', title: 'Data — ZFB + Wind — Design Token Panel' },
] as const;

export type RouteLabel = (typeof ROUTES)[number]['label'];

export const HOME_TITLE = ROUTES[0].title;

export function routeFor(label: RouteLabel) {
  const route = ROUTES.find((entry) => entry.label === label);
  if (!route) throw new Error(`unknown route ${label}`);
  return route;
}

/** Must match `panelConfig.storagePrefix` in config/panel-config.ts. */
export const STORAGE_PREFIX = 'zfb-tailwind-example-tokens';
// The panel derives its root id from `storagePrefix`.
export const PANEL_ROOT_ID = `${STORAGE_PREFIX}-root`;

export const test = base.extend<{ diagnostics: string[] }>({
  diagnostics: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') {
          problems.push(`console.error: ${message.text()} (${message.location().url})`);
        }
      });
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      page.on('requestfailed', (request) => {
        problems.push(
          `requestfailed: ${request.method()} ${request.url()} [${request.resourceType()}]` +
            ` — ${request.failure()?.errorText}`,
        );
      });
      page.on('response', (response) => {
        if (response.status() >= 400) {
          problems.push(`HTTP ${response.status()}: ${response.request().method()} ${response.url()}`);
        }
      });
      await use(problems);
      expect(problems, 'console errors, page errors and failed requests').toEqual([]);
    },
    { auto: true },
  ],
});

export function panelShell(page: Page): Locator {
  return page.locator('.tokenpanel-shell');
}

/**
 * Waits until the PanelMount island has activated and installed the console
 * API the topbar trigger calls. Before that, a click on the trigger is a no-op
 * by design (see components/app-shell.tsx).
 */
export async function waitForPanelAdapter(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { zfbTw?: { toggleDesignPanel?: unknown } }).zfbTw
        ?.toggleDesignPanel === 'function',
  );
}

/** The host's own topbar trigger, not the console API. */
export async function toggleViaHeader(page: Page): Promise<void> {
  await waitForPanelAdapter(page);
  await page.getByRole('button', { name: 'Open Design Token Panel', exact: true }).click();
}

/**
 * zdtp persists visibility in a Preact effect, after the shell renders. Wait
 * for the stored flag before any navigation or reload so the next document
 * restores the state the test just set rather than racing the write.
 */
async function expectPersistedVisibility(page: Page, value: '0' | '1'): Promise<void> {
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), `${STORAGE_PREFIX}:visible`))
    .toBe(value);
}

export async function openViaHeader(page: Page): Promise<void> {
  await expect(panelShell(page)).toHaveCount(0);
  await toggleViaHeader(page);
  await expect(panelShell(page)).toBeVisible();
  await expectPersistedVisibility(page, '1');
}

export async function closeViaHeader(page: Page): Promise<void> {
  await expect(panelShell(page)).toBeVisible();
  await toggleViaHeader(page);
  await expect(panelShell(page)).toHaveCount(0);
  await expectPersistedVisibility(page, '0');
}

/** Sidenav link click — routed by zfb's <ClientRouter /> (see components/app-shell.tsx). */
export async function navigateViaSidenav(page: Page, label: RouteLabel): Promise<void> {
  await page.locator('aside').getByRole('link', { name: label, exact: true }).click();
  await expectRoute(page, label);
}

/**
 * Asserts the current document is `label`'s route, then waits for it to
 * settle: the panel island has activated and any eager widget-module import
 * (persisted state) has finished. Leaving a page mid-import aborts the chunk
 * request, which the diagnostics fixture rightly reports as a failure.
 */
export async function expectRoute(page: Page, label: RouteLabel): Promise<void> {
  const route = routeFor(label);
  await expect(page).toHaveURL(`${ORIGIN}${route.path}`);
  await expect(page).toHaveTitle(route.title);
  await waitForPanelAdapter(page);
  await page.waitForLoadState('networkidle');
}

/**
 * Exactly one panel instance: one panel root, one set of the panel's
 * document-level mounts, one injected stylesheet, and at most one shell.
 */
export async function expectSinglePanelInstance(page: Page, shellCount: 0 | 1): Promise<void> {
  await expect(page.locator(`[id="${PANEL_ROOT_ID}"]`)).toHaveCount(1);
  for (const mount of ['highlight', 'elpath', 'element-inspect', 'domtweaker']) {
    await expect(page.locator(`[id="tokenpanel-${mount}-mount"]`)).toHaveCount(1);
  }
  // The stylesheet the panel self-injects on first mount (PORTABLE-CONTRACT §4.1.4).
  await expect(page.locator('style#zudo-design-token-panel-styles')).toHaveCount(1);
  await expect(panelShell(page)).toHaveCount(shellCount);
}

/**
 * Header actions collapse behind the "Panel actions" kebab when the shell is
 * narrower than the header's container query (zdtp recipe "Reaching header
 * actions", id-based pattern).
 */
export async function clickHeaderAction(
  page: Page,
  id: 'export' | 'import' | 'apply' | 'reset',
): Promise<void> {
  const shell = panelShell(page);
  const action = shell.locator(`[data-zdtp-action="${id}"]:visible`);
  if ((await action.count()) === 0) {
    await shell.getByRole('button', { name: 'Panel actions', exact: true }).click();
  }
  await action.click();
}

/** Opens a panel tab and fills a length token's numeric input. */
export async function setLengthToken(
  page: Page,
  tab: RegExp,
  cssVar: string,
  numericValue: string,
): Promise<void> {
  await panelShell(page).getByRole('tab', { name: tab }).click();
  const input = panelShell(page).getByRole('textbox', { name: `${cssVar} value`, exact: true });
  await input.fill(numericValue);
  await input.press('Tab');
}

/** Waits until a persisted `-state-*` envelope carries `needle`. */
export async function expectPersistedOverride(page: Page, needle: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        ({ prefix, value }) => {
          for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (key?.startsWith(`${prefix}-state`) && localStorage.getItem(key)?.includes(value)) {
              return true;
            }
          }
          return false;
        },
        { prefix: STORAGE_PREFIX, value: needle },
      ),
    )
    .toBe(true);
}

export function rootTokenValue(page: Page, cssVar: string): Promise<string> {
  return page.evaluate(
    (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    cssVar,
  );
}
