/**
 * Assembles the `PanelConfig` consumed by the zfb-tailwind example.
 *
 * The five identifier fields (`storagePrefix`, `consoleNamespace`,
 * `modalClassPrefix`, `schemaId`, `exportFilenameBase`) all share a
 * `zfb-tailwind-example*` namespace so localStorage entries, exported JSON, and
 * modal classnames cannot collide with any other host's panel deployment.
 *
 * `applyEndpoint`
 * -----------------------------------------------------------------------
 * With `base: '/'` (see zfb.config.ts), the bare path `/api/dev/apply` is
 * the correct endpoint. Per zfb issue #229 (fix commit `b1049ef`), zfb's
 * devMiddleware mounts handlers under the project base — with base '/', the
 * bare path resolves correctly to the dev-apply-proxy plugin handler.
 *
 * ### Historical context (pre-2026-05-19 monorepo deploy)
 * When this example was deployed under the monorepo's shared Cloudflare Pages
 * project with base '/pj/zudo-design-token-panel/examples/zfb-tailwind/', the
 * applyEndpoint had to be set to the FULL base-prefixed URL:
 *   /pj/zudo-design-token-panel/examples/zfb-tailwind/api/dev/apply
 * A bare '/api/dev/apply' was never reached by the zfb dev server in that
 * configuration. See plugins/dev-apply-proxy.mjs for the full rationale.
 *
 * ### Post-move (2026-05-19) — bare path works with base '/'
 * This repo deploys at the root of its own Cloudflare Pages project. With
 * base: '/', the bare '/api/dev/apply' is what the plugin registers and what
 * the panel sends — both agree.
 *
 * `applyRouting` shares the SAME JSON file the bin sidecar reads at startup
 * (`scaffold.routing.json`). The host UI and the apply server therefore
 * agree byte-for-byte on which CSS-var prefix maps to which file.
 */

import type { PanelConfig } from '@takazudo/zudo-design-token-panel/astro';
import { defaultTabs } from './default-manifest';

// Inlined from scaffold.routing.json — mirrors the same routing object the
// bin sidecar reads at startup. Kept in sync byte-for-byte with
// `scaffold.routing.json` so the host UI and the apply server agree on
// which CSS-var prefix maps to which file.
//
// Note: not imported as JSON because zfb's esbuild bundler pass currently
// resolves relative JSON imports from the temp entry dir, not the source
// file's directory. Inlining avoids the resolution issue without losing
// the semantic link to the routing contract.
const scaffoldRouting: Record<string, string> = {
  zfbtw: 'styles/global.css',
  // Easing tokens (Wave 7 demo) — same file as the other tokens.
  'zfbtw-easing': 'styles/global.css',
};

export const panelConfig: PanelConfig = {
  storagePrefix: 'zfb-tailwind-example-tokens',
  consoleNamespace: 'zfbTw',
  modalClassPrefix: 'zfb-tailwind-example-design-token-panel-modal',
  schemaId: 'zfb-tailwind-example-design-tokens/v1',
  exportFilenameBase: 'zfb-tailwind-example-design-tokens',
  tabs: defaultTabs,
  // Bare path — correct with base: '/' (see zfb.config.ts and the block comment above).
  applyEndpoint: '/api/dev/apply',
  applyRouting: scaffoldRouting,
};
