/**
 * Node launcher for every script that binds a port.
 *
 * Why a launcher rather than shell interpolation: `package.json` scripts run
 * through the shell, which forwards `${ZFB_PORT:-44328}` verbatim without ever
 * importing `scripts/ports.mjs`. A resolver consumed only by Playwright and the
 * dev plugin would therefore validate nothing on the `pnpm dev` path — exactly
 * where an unvalidated port does the most damage. Routing `dev`, `_dev:*`,
 * `preview` and the Playwright webServer through here means every port reaching
 * a process argv has been through `resolvePort`.
 *
 * Usage: node scripts/launch.mjs <target>
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => resolve(projectRoot, 'node_modules', '.bin', name);
// `concurrently` hands each entry to a shell, so the path has to be quoted —
// a checkout under a directory with a space (or any shell metacharacter) would
// otherwise split into two bogus argv entries and `pnpm dev` would die with
// "Cannot find module".
const selfTarget = (target) =>
  `node ${JSON.stringify(resolve(projectRoot, 'scripts', 'launch.mjs'))} ${target}`;

let ports;
try {
  ports = await import('./ports.mjs');
} catch (err) {
  console.error(`[launch] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const { ZFB_PORT, ZDTP_PORT, PREVIEW_PORT, SIDECAR_ALLOWED_ORIGINS } = ports;

const targets = {
  // Both dev processes under one `concurrently -k`, so killing one kills both.
  dev: () => [
    bin('concurrently'),
    [
      '-k',
      '-n', 'zfb,tokens-bin',
      '-c', 'blue,green',
      selfTarget('dev:zfb'),
      selfTarget('dev:sidecar'),
    ],
  ],

  'dev:zfb': () => [bin('zfb'), ['dev', '--port', String(ZFB_PORT)]],

  'dev:sidecar': () => [
    bin('zdtp-server'),
    [
      '--write-root', '.',
      '--routing', 'scaffold.routing.json',
      '--port', String(ZDTP_PORT),
      ...SIDECAR_ALLOWED_ORIGINS.flatMap((origin) => ['--allow-origin', origin]),
    ],
  ],

  // Also Playwright's site webServer entry; the sidecar is its own entry there
  // (see playwright.config.ts) so each port gets its own readiness gate.
  preview: () => [bin('zfb'), ['preview', '--port', String(PREVIEW_PORT)]],
};

const target = process.argv[2];
const make = Object.hasOwn(targets, target ?? '') ? targets[target] : undefined;
if (!make) {
  console.error(
    `[launch] unknown target ${JSON.stringify(target)}; expected one of: ${Object.keys(targets).join(', ')}`,
  );
  process.exit(1);
}

const [command, args] = make();
const child = spawn(command, args, { stdio: 'inherit', cwd: projectRoot });

const forwarded = ['SIGINT', 'SIGTERM'];
for (const signal of forwarded) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (err) => {
  console.error(`[launch] failed to start ${command}: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    // Die the same way the child did. The forwarding listeners have to come off
    // first: while one is registered it overrides Node's default handling, so
    // re-raising the signal would just call back into `child.kill` on a corpse.
    for (const name of forwarded) process.removeAllListeners(name);
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
