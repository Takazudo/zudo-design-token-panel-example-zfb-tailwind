/**
 * Regression test for the dev-apply-proxy's header forwarding.
 *
 * No browser-driven spec can cover this. `tests/e2e/apply-roundtrip.spec.ts`
 * POSTs the sidecar directly and sets `Origin` itself, so it stays green while
 * the proxy drops the header — which is exactly how the proxy shipped with
 * `content-type` as the only forwarded header, 403-ing every panel-driven
 * Apply regardless of what `--allow-origin` was configured with.
 *
 * Run with: pnpm test:unit
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import plugin from '../../plugins/dev-apply-proxy.mjs';
import { ZDTP_PORT } from '../../scripts/ports.mjs';

/** Drive `devMiddleware` with a fake ctx and hand back the registered handler. */
function captureHandler() {
  const registered = new Map();
  const ctx = {
    register: (route, handler) => registered.set(route, handler),
    logger: { error: () => {}, warn: () => {}, info: () => {} },
  };
  plugin.devMiddleware(ctx);
  const handler = registered.get('/api/dev/apply');
  assert.ok(handler, 'plugin registered no handler at /api/dev/apply');
  return handler;
}

/**
 * Swap in a fetch stub that records its arguments and returns a canned 200.
 * Returns the recorder plus a restore function.
 */
function stubFetch() {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test('forwards the browser Origin header to the sidecar', async () => {
  const handler = captureHandler();
  const { calls, restore } = stubFetch();
  try {
    const response = await handler({
      method: 'POST',
      headers: { origin: 'http://localhost:44328', 'content-type': 'application/json' },
      body: '{"tokens":{}}',
    });

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `http://127.0.0.1:${ZDTP_PORT}/apply`);
    // The whole point: the sidecar's CORS check compares this verbatim against
    // its --allow-origin list, so dropping it 403s every panel-driven Apply.
    assert.equal(calls[0].init.headers.origin, 'http://localhost:44328');
    assert.equal(calls[0].init.headers['content-type'], 'application/json');
    assert.equal(calls[0].init.body, '{"tokens":{}}');
  } finally {
    restore();
  }
});

test('omits Origin entirely when the incoming request has none', async () => {
  const handler = captureHandler();
  const { calls, restore } = stubFetch();
  try {
    await handler({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    // An empty-string origin would be *worse* than none: the sidecar would
    // compare '' against its allow list and reject with a misleading message.
    assert.ok(!('origin' in calls[0].init.headers));
  } finally {
    restore();
  }
});

test('rejects non-POST without touching the sidecar', async () => {
  const handler = captureHandler();
  const { calls, restore } = stubFetch();
  try {
    const response = await handler({ method: 'GET', headers: {}, body: '' });
    assert.equal(response.status, 405);
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});
