// zfb plugin: dev-apply-proxy
//
// Intercepts POST /api/dev/apply and forwards the request body verbatim to
// the bin sidecar running on http://127.0.0.1:24686/apply.
//
// With `base: '/'` (see zfb.config.ts), the bare path /api/dev/apply is the
// correct registration target. Per zfb issue #229 (fix commit b1049ef),
// devMiddleware handlers are scoped under the project base — so with base '/',
// a bare path resolves correctly without any prefix.
//
// Historical note: in the monorepo deploy (pre-2026-05-19), this example used
// base '/pj/zudo-design-token-panel/examples/zfb-tailwind/' and the handler
// had to register at the full prefixed path. Now that this example has its own
// Cloudflare Pages project at the root, base '/' and the bare path work.
//
// The plugin is dev-only. During `zfb build` the `devMiddleware` hook is
// not invoked, so the production static output has no dependency on this
// module or on the sidecar port.
//
// No npm dependencies: global `fetch` (available in Node 18+) is used to
// forward the request. The response status and body are piped back verbatim
// so the panel's apply-pipeline sees the same error codes the sidecar emits.

const BIN_SIDECAR_APPLY_URL = "http://127.0.0.1:24686/apply";

// Cap dev-mode apply requests so a stuck sidecar doesn't hang the panel UI
// indefinitely. 15s comfortably covers a slow scaffold rewrite.
const SIDECAR_TIMEOUT_MS = 15_000;

// Bare path — works correctly with `base: '/'` in zfb.config.ts.
// Per zfb issue #229 (fix commit b1049ef), devMiddleware paths are scoped under
// the project base; bare '/api/dev/apply' resolves to the root.
const APPLY_ROUTE = "/api/dev/apply";

/** @type {import("@takazudo/zfb/plugins").ZfbPlugin} */
export default {
  name: "dev-apply-proxy",

  devMiddleware(ctx) {
    ctx.register(APPLY_ROUTE, async (req) => {
      if (req.method !== "POST") {
        // Only POST is valid for the apply endpoint; let other methods 405.
        return {
          status: 405,
          headers: { "content-type": "text/plain" },
          body: "Method Not Allowed",
        };
      }

      let upstreamResponse;
      try {
        upstreamResponse = await fetch(BIN_SIDECAR_APPLY_URL, {
          method: "POST",
          headers: {
            "content-type": req.headers["content-type"] ?? "application/json",
          },
          // `req.body` is the raw request body string forwarded by zfb's
          // plugin host. Forward it verbatim — the bin sidecar expects JSON.
          body: req.body ?? "",
          signal: AbortSignal.timeout(SIDECAR_TIMEOUT_MS),
        });
      } catch (err) {
        // Sidecar unreachable (not started yet, crashed, wrong port, …) or
        // request exceeded SIDECAR_TIMEOUT_MS (TimeoutError from AbortSignal).
        const isTimeout = err instanceof Error && err.name === "TimeoutError";
        ctx.logger.error(
          `[dev-apply-proxy] fetch to ${BIN_SIDECAR_APPLY_URL} ${
            isTimeout ? `timed out after ${SIDECAR_TIMEOUT_MS}ms` : `failed: ${String(err)}`
          }`,
        );
        return {
          status: isTimeout ? 504 : 502,
          headers: { "content-type": "text/plain" },
          body: isTimeout
            ? `Gateway Timeout: bin sidecar did not respond within ${SIDECAR_TIMEOUT_MS}ms`
            : `Bad Gateway: bin sidecar unreachable at ${BIN_SIDECAR_APPLY_URL}`,
        };
      }

      const responseBody = await upstreamResponse.text();
      return {
        status: upstreamResponse.status,
        headers: {
          "content-type":
            upstreamResponse.headers.get("content-type") ?? "application/json",
        },
        body: responseBody,
      };
    });
  },
};
