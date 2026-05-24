import { defineConfig } from "@takazudo/zfb/config";

/**
 * zfb + Tailwind v4 example for @takazudo/zdtp.
 *
 * Mirrors examples/zfb/ but with Tailwind v4 enabled via
 * `tailwind: { enabled: true }`. This flag instructs zfb to integrate
 * @tailwindcss/vite into the build pipeline so that `@import "tailwindcss"`
 * and `@theme { ... }` blocks in CSS files are processed correctly.
 *
 * Content collections
 * -------------------
 * The `collections` entry declares a "prose" collection (mapped to
 * `content/prose/`). zfb's collection mechanism enables the `getCollection`
 * helper in page components, mirroring how Sub 5 (#45) wires MDX in the
 * plain zfb example.
 *
 * Apply-pipeline (dev only)
 * -------------------------
 * The `dev-apply-proxy` plugin intercepts POST /api/dev/apply and forwards it
 * to the bin sidecar at http://127.0.0.1:24686/apply.
 *
 * With `base: '/'`, the bare path /api/dev/apply is the correct registration
 * target — per zfb issue #229 (fix commit b1049ef), devMiddleware handlers are
 * scoped under the project base, so a bare path resolves correctly when base is '/'.
 *
 * Port 24686 (tokens-bin) and 44328 (zfb dev) are offset by +1 from the
 * plain zfb demo to avoid collision when both run simultaneously.
 *
 * Deploy `base`
 * -------------
 * `base: '/'` — this repo deploys at the root of its own Cloudflare Pages
 * project (zudo-design-token-panel-example-zfb-tailwind.pages.dev).
 */
export default defineConfig({
  framework: "preact",
  base: "/",
  tailwind: { enabled: true },
  collections: [{ name: "prose", path: "content/prose" }],
  // Demo: opt into a curated subset via the per-construct form.
  // See ../zfb/zfb.config.ts for the shorthand form.
  markdown: { gfm: { strikethrough: true, table: true } },
  plugins: [
    {
      name: "./plugins/dev-apply-proxy.mjs",
    },
  ],
});
