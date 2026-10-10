/**
 * Proves the suite talks to THIS repo's preview server + sidecar before any
 * spec runs.
 *
 * Playwright's webServer only waits for the two URLs to answer. With BASE_URL
 * (caller-managed servers) nothing checks what is listening at all, so this
 * checks identity:
 *   - the sidecar's /healthz reports this checkout as writeRoot and
 *     scaffold.routing.json as its routing file;
 *   - the preview server serves this example's home page;
 *   - the preview server's `/api/dev/apply` (plugins/dev-apply-proxy.mjs,
 *     `previewMiddleware`) reaches the sidecar: a dry-run POST answered with
 *     the sidecar's dry-run envelope for styles/global.css can only come from
 *     zdtp-server — `zfb preview` alone has no such route. A dry run never
 *     touches disk.
 * Any mismatch throws, which fails the whole run.
 */

import { realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { HOME_TITLE, ORIGIN, REPO_ROOT, SIDECAR_ORIGIN } from './support';

export default async function globalSetup(): Promise<void> {
  const health = await fetch(`${SIDECAR_ORIGIN}/healthz`);
  if (!health.ok) throw new Error(`sidecar /healthz answered ${health.status}`);
  const info = (await health.json()) as { ok?: boolean; writeRoot?: string; routing?: string };
  if (info.ok !== true) throw new Error(`sidecar /healthz not ok: ${JSON.stringify(info)}`);
  if (!info.writeRoot || realpathSync(info.writeRoot) !== realpathSync(REPO_ROOT)) {
    throw new Error(`sidecar writeRoot ${info.writeRoot} is not this checkout (${REPO_ROOT})`);
  }
  if (!info.routing || basename(info.routing) !== 'scaffold.routing.json') {
    throw new Error(`sidecar routing ${info.routing} is not scaffold.routing.json`);
  }

  const home = await fetch(`${ORIGIN}/`);
  const html = await home.text();
  if (!home.ok || !html.includes(`<title>${HOME_TITLE}</title>`)) {
    throw new Error(`preview server at ${ORIGIN} is not serving this example (${home.status})`);
  }

  const dryRun = await fetch(`${ORIGIN}/api/dev/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ tokens: { '--zfbtw-radius': '1.25rem' }, dryRun: true }),
  });
  const envelope = (await dryRun.json().catch(() => null)) as {
    ok?: boolean;
    dryRun?: boolean;
    files?: Array<{ file: string }>;
  } | null;
  if (
    dryRun.status !== 200 ||
    envelope?.ok !== true ||
    envelope.dryRun !== true ||
    envelope.files?.[0]?.file !== 'styles/global.css'
  ) {
    throw new Error(
      `/api/dev/apply on the preview server did not reach the sidecar (status ${dryRun.status}, body ${JSON.stringify(envelope)})`,
    );
  }
}
