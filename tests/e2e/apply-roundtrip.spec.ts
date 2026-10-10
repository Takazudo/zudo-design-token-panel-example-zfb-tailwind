/**
 * Apply pipeline for the ZFB + Wind example, driven through the panel UI
 * against the built preview.
 *
 * The suite serves the BUILT `dist/` through `zfb preview`, so the two halves
 * of "Apply works" are separate facts and are asserted separately:
 *
 *   1. Disk: topbar trigger → Size tab → edit `--zfbtw-radius` → header Apply →
 *      apply modal "Write 1 file" → POST /api/dev/apply (the preview server's
 *      `previewMiddleware` in plugins/dev-apply-proxy.mjs) → zdtp-server →
 *      `styles/global.css` rewritten. The rewritten bytes must equal the
 *      original with exactly the one declaration line changed. Nothing is
 *      rebuilt, so the served stylesheet must still carry the old value.
 *   2. Browser: the same panel edit changes a visible element's computed style
 *      through the panel's in-memory `:root` override, while the served
 *      stylesheet (and the file on disk) stay untouched.
 *
 * The file's original bytes are captured before the tests. `afterEach` writes
 * them back and asserts the restored file equals them byte-for-byte — it runs
 * even when a test fails. Serial mode (plus `workers: 1` in the config) keeps
 * any other spec from observing the file mid-rewrite.
 */

import { readFile, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import {
  TOKENS_PATH,
  clickHeaderAction,
  expect,
  openViaHeader,
  panelShell,
  rootTokenValue,
  setLengthToken,
  test,
} from './support';

test.describe.configure({ mode: 'serial' });

const TARGET_VAR = '--zfbtw-radius';
const ORIGINAL_LINE = `  ${TARGET_VAR}: 0.5rem;`;
const APPLIED_LINE = `  ${TARGET_VAR}: 1.25rem;`;

let originalBytes: Buffer;

test.beforeAll(async () => {
  originalBytes = await readFile(TOKENS_PATH);
});

test.afterEach(async () => {
  const current = await readFile(TOKENS_PATH);
  if (!current.equals(originalBytes)) {
    await writeFile(TOKENS_PATH, originalBytes);
  }
  const restored = await readFile(TOKENS_PATH);
  expect(restored.equals(originalBytes), 'styles/global.css restored byte-for-byte').toBe(true);
});

/** The built stylesheet the preview server serves for the current page. */
async function servedStylesheet(page: Page): Promise<string> {
  const href = await page.locator('link[rel="stylesheet"][href^="/assets/"]').getAttribute('href');
  expect(href, 'built stylesheet link').toBeTruthy();
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  return response.text();
}

test('panel Apply rewrites styles/global.css on disk with exactly the edited declaration', async ({
  page,
}) => {
  const originalText = originalBytes.toString('utf8');
  expect(originalText.split(ORIGINAL_LINE)).toHaveLength(2);
  const expectedBytes = Buffer.from(originalText.replace(ORIGINAL_LINE, APPLIED_LINE), 'utf8');

  await page.goto('/');
  await openViaHeader(page);
  await setLengthToken(page, /^size$/i, TARGET_VAR, '1.25');
  expect(await rootTokenValue(page, TARGET_VAR)).toBe('1.25rem');

  await clickHeaderAction(page, 'apply');
  const applyModal = page.getByRole('dialog', { name: 'Apply design tokens to codebase' });
  const writeButton = applyModal.getByRole('button', { name: /^Write 1 file \(1 token\)$/ });
  await expect(writeButton).toBeVisible();
  // The modal POSTs a dry-run preview on open and keeps the button
  // aria-disabled until it resolves.
  await expect(writeButton).not.toHaveAttribute('aria-disabled', /.*/);

  const writeResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/dev/apply' &&
      response.request().method() === 'POST' &&
      (response.request().postDataJSON() as { dryRun?: boolean }).dryRun !== true,
  );
  await writeButton.click();
  const response = await writeResponse;
  expect(response.status()).toBe(200);
  // Success envelope: PORTABLE-CONTRACT §5.1 "Response 200 (success)".
  const body = (await response.json()) as {
    ok: boolean;
    updated: Array<{ file: string; changed: string[] }>;
  };
  expect(body.ok).toBe(true);
  expect(body.updated.map(({ file, changed }) => ({ file, changed }))).toEqual([
    { file: 'styles/global.css', changed: [TARGET_VAR] },
  ]);
  await expect(applyModal.getByRole('button', { name: 'Done', exact: true })).toBeVisible();

  await expect
    .poll(async () => (await readFile(TOKENS_PATH)).equals(expectedBytes), {
      message: 'styles/global.css equals the original with only the edited line changed',
    })
    .toBe(true);

  // The write landed on disk only: preview keeps serving the built dist.
  const served = await servedStylesheet(page);
  expect(served).toMatch(/--zfbtw-radius:\s*0?\.5rem/);
  expect(served).not.toMatch(/--zfbtw-radius:\s*1\.25rem/);

  await applyModal.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(applyModal).toBeHidden();
  await expect(panelShell(page)).toBeVisible();
});

test('panel edit restyles the page through the in-memory override while dist and disk stay as built', async ({
  page,
}) => {
  await page.goto('/');
  const link = page.locator('aside a.font-semibold');
  await expect(link).toHaveCSS('border-top-left-radius', '8px');

  await openViaHeader(page);
  await setLengthToken(page, /^size$/i, TARGET_VAR, '1.25');

  await expect(link).toHaveCSS('border-top-left-radius', '20px');
  // The value comes from the panel's inline :root override …
  expect(
    await page.evaluate(
      (name) => document.documentElement.style.getPropertyValue(name).trim(),
      TARGET_VAR,
    ),
  ).toBe('1.25rem');
  // … not from a rebuilt stylesheet or a rewritten file.
  expect(await servedStylesheet(page)).toMatch(/--zfbtw-radius:\s*0?\.5rem/);
  expect((await readFile(TOKENS_PATH)).equals(originalBytes)).toBe(true);
});
