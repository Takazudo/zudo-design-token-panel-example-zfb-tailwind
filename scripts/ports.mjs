/**
 * Single source of truth for the three ports this harness binds.
 *
 * `ZFB_PORT` / `ZDTP_PORT` / `PREVIEW_PORT` let concurrent git worktrees of
 * this repo run side by side. Everything that needs one reads it from here —
 * the dev server, the preview server, the `/api/dev/apply` proxy target, the
 * sidecar's `--allow-origin` list, Playwright's `baseURL` and its webServer —
 * so no two of them can drift apart.
 *
 * Digits-only is deliberate, not pedantry. Every consumer that is not JS gets
 * the value as an argv string, while JS parses it with `Number()`. Anything JS
 * coerces but a port parser does not — `' '` (-> 0), `'1e4'`, `'0x20'` — would
 * otherwise bind one port while telling another process about a different one,
 * and the sidecar's CORS check would then reject every /apply POST with no hint
 * as to why. That exact desync was found in review on the vite-react sibling,
 * inside the fix meant to prevent it.
 */

// Offset by +1 from the plain zfb demo (44327 / 24685) so both examples can be
// served at once from neighbouring checkouts.
export const DEFAULT_ZFB_PORT = 44328;
export const DEFAULT_ZDTP_PORT = 24686;
export const DEFAULT_PREVIEW_PORT = 4173;

export function resolvePort(envVar, fallback) {
  const raw = process.env[envVar];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${envVar} must be an integer port, got ${JSON.stringify(raw)}`);
  }
  const parsed = Number(raw);
  if (parsed < 1 || parsed > 65535) {
    throw new Error(`${envVar} must be between 1 and 65535, got ${parsed}`);
  }
  return parsed;
}

export const ZFB_PORT = resolvePort('ZFB_PORT', DEFAULT_ZFB_PORT);
export const ZDTP_PORT = resolvePort('ZDTP_PORT', DEFAULT_ZDTP_PORT);
export const PREVIEW_PORT = resolvePort('PREVIEW_PORT', DEFAULT_PREVIEW_PORT);

// The sidecar runs alongside whichever server is up, so a collision with
// either one is always a misconfiguration. `ZFB_PORT` and `PREVIEW_PORT` are
// deliberately NOT compared against each other: `zfb dev` and `zfb preview`
// never run at the same time, so sharing a port between them is legal.
if (ZDTP_PORT === ZFB_PORT) {
  throw new Error(`ZDTP_PORT must differ from ZFB_PORT (both are ${ZDTP_PORT})`);
}
if (ZDTP_PORT === PREVIEW_PORT) {
  throw new Error(`ZDTP_PORT must differ from PREVIEW_PORT (both are ${ZDTP_PORT})`);
}

export const DEV_ORIGIN = `http://localhost:${ZFB_PORT}`;
export const PREVIEW_ORIGIN = `http://localhost:${PREVIEW_PORT}`;

/**
 * Origin the browser is driven against, and the value the sidecar compares
 * verbatim against its own `--allow-origin`.
 *
 * `||`, not `??`: an exported-but-empty `BASE_URL` counts as unset. With `??`
 * it would survive as `''` and every Origin header built from it would be
 * malformed. `new URL(...).origin` rather than string surgery, so a `BASE_URL`
 * carrying a path, a query or a trailing slash still yields a bare origin.
 */
function resolveBrowserOrigin() {
  const raw = process.env.BASE_URL || '';
  if (raw === '') return PREVIEW_ORIGIN;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`BASE_URL must be an absolute http(s) URL, got ${JSON.stringify(raw)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`BASE_URL must use http: or https:, got ${JSON.stringify(raw)}`);
  }
  return url.origin;
}

export const BROWSER_ORIGIN = resolveBrowserOrigin();

/**
 * Every origin a browser may POST /apply from. Both server origins are always
 * allowed — the specs drive preview while a hand-run `pnpm dev` drives the dev
 * server, and passing only one of them is the CORS desync this list exists to
 * kill. `--allow-origin` is repeatable (see `zdtp-server --help`), so the
 * sidecar takes the whole set.
 */
export const SIDECAR_ALLOWED_ORIGINS = [
  ...new Set([DEV_ORIGIN, PREVIEW_ORIGIN, BROWSER_ORIGIN]),
];
