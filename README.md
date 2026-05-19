# zudo-design-token-panel-example-zfb-tailwind

Standalone example demonstrating [@takazudo/zudo-design-token-panel](https://github.com/Takazudo/zudo-design-token-panel) inside a [zfb (zudo-front-builder)](https://github.com/Takazudo/zudo-front-builder) project with **Tailwind v4 enabled** via `tailwind: { enabled: true }`.

Design tokens are registered via Tailwind v4's `@theme` block so utility classes like `bg-primary`, `p-vsp-md`, and `text-body` resolve back to the panel's `--zfbtw-*` CSS custom properties.

Deployed at: https://zudo-design-token-panel-example-zfb-tailwind.pages.dev/

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

## Development

```sh
pnpm dev
```

This starts two processes in parallel via `concurrently`:
- `zfb dev` — the zfb dev server at `http://localhost:44328`
- `design-token-panel-server` — the bin sidecar at port `24686`

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

## Apply endpoint

With `base: '/'`, the dev-apply-proxy plugin registers at the bare path `/api/dev/apply`. The panel config's `applyEndpoint` is set to `/api/dev/apply`.

This differs from the monorepo version (pre-2026-05-19) where `base` was `/pj/zudo-design-token-panel/examples/zfb-tailwind/` and the full prefixed path was required. See `plugins/dev-apply-proxy.mjs` and `config/panel-config.ts` for the historical context.
