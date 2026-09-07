# zudo-design-token-panel-example-zfb-tailwind

Standalone example demonstrating [@takazudo/zdtp](https://github.com/Takazudo/zudo-design-token-panel) inside a [zfb (zudo-front-builder)](https://github.com/Takazudo/zudo-front-builder) project with **Tailwind v4 enabled** via `tailwind: { enabled: true }`.

Design tokens are registered via Tailwind v4's `@theme` block so utility classes like `bg-primary`, `p-vsp-md`, and `text-body` resolve back to the panel's `--zfbtw-*` CSS custom properties.

Deployed to **Cloudflare Workers Static Assets** at: https://zdtp-zfb-tailwind.zudolab.dev/

(Worker name and custom domain live in `wrangler.toml`; `.github/workflows/deploy.yml` publishes on push to `main` and uploads a preview version per PR.)

## Sibling layout

This repo uses `file:` dependencies pointing to sibling directories. The expected layout under `$HOME/repos/zdtp-ex/` is:

```
$HOME/repos/zdtp-ex/
  zudo-design-token-panel/          <- panel package (pinned SHA)
  zfb/                              <- zfb build tool (pinned SHA)
  zudo-design-token-panel-example-zfb-tailwind/   <- this repo
```

The pinned SHAs are stored in `framework-pins.json` at the repo root.

## Bootstrap (fresh checkout)

**Important:** `pnpm install` alone will FAIL on a fresh checkout because the sibling directories do not exist yet. Always bootstrap with:

```sh
pnpm setup:upstream
```

This command:
1. Clones or updates both sibling repos at the pinned SHAs from `framework-pins.json`
2. Installs zfb workspace deps (required by zfb's cargo build script)
3. Installs the zfb CLI into `.zfb-bin/` (project-local, does not touch global `~/.cargo/bin`)
4. Runs `pnpm install` in this consumer
5. Runs `pnpm build` to verify the full pipeline

zfb is a Rust-based build tool. The bootstrap requires `cargo` to be installed. See: https://rustup.rs/

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
# terminal 2 — the sidecar the apply-roundtrip spec POSTs to
BASE_URL=http://localhost:4174 ZDTP_PORT=24786 pnpm run _dev:tokens-bin
# terminal 3
BASE_URL=http://localhost:4174 ZDTP_PORT=24786 pnpm test:e2e
```

Forget terminal 2 and the apply spec fails with a connection error; give the
sidecar a different `BASE_URL` than the run and it fails with a 403 instead.

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
pnpm test:unit   # node:test — the dev-apply-proxy's header forwarding
pnpm test:e2e    # Playwright — builds, serves preview + sidecar, then runs
```

`pnpm test:e2e` is self-contained: it declares two `webServer` entries —
`node scripts/launch.mjs preview` (after `pnpm run build`) and
`node scripts/launch.mjs dev:sidecar` — so Playwright waits on `PREVIEW_PORT`
**and** `ZDTP_PORT` before the first spec runs. One entry starting both would
only gate the site, and `apply-roundtrip.spec.ts` POSTs the sidecar with no
retry. It must be preview rather than `zfb dev` — dev injects no islands script
tag, so `window.zfbTw` never appears (Takazudo/zudo-front-builder#377, still
true at zfb 2.15.1).

## Apply endpoint

With `base: '/'`, the dev-apply-proxy plugin registers at the bare path `/api/dev/apply`. The panel config's `applyEndpoint` is set to `/api/dev/apply`.

This differs from the monorepo version (pre-2026-05-19) where `base` was `/pj/zudo-design-token-panel/examples/zfb-tailwind/` and the full prefixed path was required. See `plugins/dev-apply-proxy.mjs` and `config/panel-config.ts` for the historical context.
