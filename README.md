# zudo-design-token-panel-example-zfb-tailwind

Standalone example demonstrating [@takazudo/zdtp](https://github.com/Takazudo/zudo-design-token-panel) inside a [ZFB (zudo-front-builder)](https://github.com/Takazudo/zudo-front-builder) project with **ZFB 4 and Wind (zudo-wind)**.

Design tokens are registered via `wind.tokens` in `zfb.config.ts` so utility classes like `bg-primary`, `p-vsp-md`, and `text-body` resolve back to the panel's `--zfbtw-*` CSS custom properties.

Deployed to **Cloudflare Workers Static Assets** at: https://zdtp-zfb-tailwind.zudolab.dev/

(Worker name and custom domain live in `wrangler.toml`; `.github/workflows/deploy.yml` publishes on push to `main` and uploads a preview version per non-draft PR.)

## Bootstrap (fresh checkout)

Use Node >=22.12 and the pinned pnpm 10.33.2:

```sh
corepack pnpm install --frozen-lockfile
pnpm typecheck
pnpm audit:wind
pnpm build
pnpm assert:theme-chain
```

Dependencies resolve from npm. The host uses zudo-react; zdtp 0.8.6 is an
opaque, lazy, self-mounting widget that owns its Preact runtime and injects its
own stylesheet, so the host declares no `preact` dependency and imports no
panel CSS. The repository name keeps the historical Tailwind name; the route
titles say ZFB + Wind. Wind utility tokens reference the authored `--zfbtw-*`
values through `--zw-*` variables; panel edits remain authoritative.

## Ports

Every port this repo binds is resolved in exactly one place —
`scripts/ports.mjs` — and read from there by `pnpm dev`, `pnpm preview`, the
`/api/dev/apply` proxy plugin, the sidecar's `--allow-origin` list and
Playwright's config. Nothing hard-codes a number, so concurrent git worktrees
can run side by side by overriding the env vars:

| Env var        | Default | Binds                              |
| -------------- | ------- | ---------------------------------- |
| `ZFB_PORT`     | `44328` | `zfb dev`                          |
| `ZDTP_PORT`    | `24686` | `zdtp-server` (the apply sidecar)  |
| `PREVIEW_PORT` | `4173`  | `zfb preview`, Playwright `baseURL`|

```sh
ZFB_PORT=44428 ZDTP_PORT=24786 pnpm dev
```

Values must be digits only and within 1–65535. That strictness is deliberate:
non-JS consumers receive the value as an argv string while JS parses it with
`Number()`, so `'1e4'` or `'0x20'` would bind one port while telling another
process a different one — and the sidecar's CORS check would then reject every
`/apply` POST with no hint why.

### Testing against servers you started yourself

Set `BASE_URL`. Playwright then skips its own `webServer` entirely, which makes
you responsible for **both** the site **and** the sidecar. Pass the same
`BASE_URL` and `ZDTP_PORT` to the sidecar and to the test run — the sidecar
derives its allowed origins from `BASE_URL` too, so omitting it there is exactly
the CORS desync this setup exists to prevent.

```sh
# terminal 1 — the site (build first; preview serves dist/)
pnpm build && PREVIEW_PORT=4174 pnpm preview
# terminal 2 — the sidecar the preview server's /api/dev/apply forwards to
BASE_URL=http://localhost:4174 ZDTP_PORT=24786 pnpm run _dev:tokens-bin
# terminal 3
BASE_URL=http://localhost:4174 ZDTP_PORT=24786 pnpm test:e2e
```

Forget terminal 2 and the run's global setup fails before any spec (it checks
the sidecar's `/healthz` and that `/api/dev/apply` reaches it); give the sidecar
a different `BASE_URL` than the run and the panel's Apply fails with a 403.

### `EADDRINUSE` / "port already in use"

Nothing clears a stale server for you. When a start fails with `EADDRINUSE`, or
`zdtp-server` reports `port … already in use`:

1. Find the owner — `lsof -ti:$ZFB_PORT` (or `ss -ltnp | grep :44328` for the
   default) — and stop that process yourself if it is genuinely yours. It may
   belong to another worktree.

   Nothing in `package.json` kills it for you any more. The `dev` script used
   to open by force-killing whatever held the two default ports, which reached
   across every checkout on the machine and took out sibling worktrees' servers
   and in-flight Playwright runs — while never guarding this repo's own test
   path, since Playwright bypassed the script entirely.
2. Or just pick different ports with the env vars above.

Playwright uses `reuseExistingServer: false` on purpose: preview serves a
**built** `dist/`, so silently reusing someone else's server would test a stale
build. Use `BASE_URL` when you deliberately want to reuse one.

## Development

```sh
pnpm dev
```

This starts two processes in parallel via `concurrently`:
- `zfb dev` — the zfb dev server on `ZFB_PORT` (default `44328`)
- `zdtp-server` — the bin sidecar on `ZDTP_PORT` (default `24686`)

Open the panel from the browser:
```js
window.zfbTw.toggleDesignPanel()
```

## Build

```sh
pnpm build
```

Output lands in `dist/`.

## Preview (after build)

```sh
pnpm preview
```

## Typecheck

```sh
pnpm typecheck
```

## Tests

```sh
pnpm test:unit   # node:test — the dev-apply-proxy's header forwarding + registration
pnpm test:e2e    # Playwright — builds, serves preview + sidecar, then runs
```

`pnpm test:e2e` is self-contained: it declares two `webServer` entries —
`node scripts/launch.mjs preview` (after `pnpm run build`) and
`node scripts/launch.mjs dev:sidecar` — so Playwright waits on both before the
first spec runs, and `tests/e2e/global-setup.ts` proves both listeners belong to
this checkout. It must be preview rather than `zfb dev` — dev injects no islands
script tag, so `window.zfbTw` never appears (Takazudo/zudo-front-builder#377).
There are no retries.

What the suite covers:

- **Apply, two separate proofs** (`apply-roundtrip.spec.ts`). The panel's Apply
  button writes `styles/global.css` on disk through `/api/dev/apply` →
  `zdtp-server`, and the spec asserts the exact rewritten bytes, then restores
  the captured original byte-for-byte in `afterEach`. Preview keeps serving the
  built `dist/`, so the in-browser restyle is asserted separately: it comes
  from the panel's in-memory `:root` override, not from the file.
- **Client-side navigation** (`navigation-lifecycle.spec.ts`). The layout
  mounts zfb's `<ClientRouter />`, so sidenav clicks and back/forward are
  swaps: a `window` marker survives and `zfb:after-swap` fires once per
  navigation. Panel visibility and token edits persist across swaps, history
  and reload, and the page always holds exactly one panel instance.
- **Token edits** (`token-tweak-style.spec.ts`). Font, spacing and color edits
  made in the panel reach the computed style of Wind-utility elements.
- **Errors.** Every test fails on any console error, page error, failed request
  or HTTP status of 400 or above.

CI runs the suite in the blocking `Browser (Playwright + real Apply)` job of
`.github/workflows/deploy.yml` on every pull request and on push to `main`.
Content-only changes (`*.md` / `*.mdx` and other paths outside
`scripts/browser-relevant-changes.sh`) log `skipped: content-only` and pass.

## Apply endpoint

With `base: '/'`, the dev-apply-proxy plugin registers at the bare path `/api/dev/apply`. The panel config's `applyEndpoint` is set to `/api/dev/apply`.

The plugin registers that route under both `devMiddleware` (`pnpm dev`) and `previewMiddleware` (`pnpm preview`), so Apply works against either local server. Neither hook runs during `zfb build`, so the deployed site has no apply endpoint.

This differs from the monorepo version (pre-2026-05-19) where `base` was `/pj/zudo-design-token-panel/examples/zfb-tailwind/` and the full prefixed path was required. See `plugins/dev-apply-proxy.mjs` and `config/panel-config.ts` for the historical context.

