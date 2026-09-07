"use client";

/**
 * PanelMount — the `"use client"` island that bootstraps the design-token
 * panel adapter inside the zfb hydration pipeline.
 *
 * zfb renders pages as server components by default. This file marks the
 * boundary between server-rendered HTML and the Preact island that runs in
 * the browser. `components/app-shell.tsx` wraps this component in
 * `<Island when="visible" ssrFallback={null}>`, so zfb emits a skip-SSR
 * placeholder at the end of `<body>` and the hydration runtime renders this
 * component into it only once an `IntersectionObserver` (threshold 0) reports
 * the placeholder on screen — never at SSR time, and, since an observer
 * callback is delivered no earlier than the first rendering pass, not before
 * first paint either. (The runtime does fall back to hydrating immediately on
 * a browser with no `IntersectionObserver` at all; that path is not the one
 * the reasoning below is about.)
 *
 * Panel adapter bootstrap
 * -----------------------
 *   1. `configurePanel(panelConfig)` — supplies the host's config object to
 *      the panel package's singleton BEFORE any other panel API runs. Called
 *      once per storagePrefix, gated by the `bound` flag on
 *      `window.__zudoDesignTokenPanelAdapter`.
 *   2. Console API on `window[cfg.consoleNamespace]` — exposes
 *      `showDesignPanel` / `hideDesignPanel` / `toggleDesignPanel`.
 *   3. Eager-load gate — dynamically import the panel module when any
 *      persisted signal says the user had the panel in use.
 *   4. `reapplyPersistedOverrides()` — called immediately after
 *      `configurePanel` so persisted overrides land as soon as the module
 *      resolves.
 *
 * What the eager-load gate buys in THIS host — and what it does not
 * -----------------------------------------------------------------
 * The vite-react and Next hosts run their equivalent gate from the entry
 * script, so a hit there restores the user's tweaks before the first paint
 * and the gate genuinely defends against an FOUT. That reasoning does NOT
 * transfer here. Under `when="visible"` this whole file is deferred until
 * after paint by construction, so a returning user with saved overrides
 * always sees at least one frame of stylesheet defaults. The gate cannot
 * close that window, and widening it would not help. (Switching the mount to
 * `when="load"` would, but at the cost of the panel adapter re-entering the
 * initial JS chunk on every page — deliberately not done.)
 *
 * What the gate decides here is whether the panel chunk is fetched *at all*.
 * A visitor with no panel signals never downloads it; a user who left the
 * panel open, armed a closed-shell feature, or saved overrides gets that
 * state restored on hydration without having to call a `window.zfbTw.*`
 * helper from the console. That is why the gate still has to be exhaustive:
 * a missed signal is not a cosmetic flash here, it is a feature that silently
 * never comes back.
 *
 * Eager-load signals come from the package, never from this file
 * -------------------------------------------------------------
 * The gate reads `@takazudo/zdtp/constants` — a zero-import sub-entry
 * carrying only the signal registry (~1 KB), so importing it statically does
 * not drag the panel bundle into this island's chunk, which is the whole
 * point of the dynamic import in `loadPanelModule`.
 *
 * This file used to hard-code two key formatters instead — the `:visible`
 * flag key, and one pinned version of the persisted-state key — and both
 * halves were wrong. `:visible` alone is not the flag set: opening the panel
 * also writes `:autoload`, and closing the panel never clears it, so a
 * visible-only gate leaves autoload unrestored. And the state probe named a
 * single storage version while the loader has since moved on to a later one —
 * so a user with saved overrides got no eager boot at all, with nothing
 * logged anywhere. Driving both halves off the package registries cannot go
 * stale that way again.
 *
 * Returns `null` — the panel adapter appends its own DOM root outside the
 * Preact tree; this component owns no DOM of its own.
 */

import { useEffect } from 'preact/hooks';
import type { PanelConfig } from '@takazudo/zdtp/astro';
import {
  EAGER_LOAD_GATE_KEY_SUFFIXES,
  EAGER_LOAD_GATE_STATE_FAMILY,
} from '@takazudo/zdtp/constants';
import { panelConfig } from '../config/panel-config';

// Mirrors the panel module's main entry shape we lazy-import below.
type DesignTokenPanelModule = typeof import('@takazudo/zdtp');

interface DesignTokenPanelAdapterState {
  /** Per-`storagePrefix` bind flag — re-runs are no-ops. */
  bound: boolean;
  /** Memoised module promise so steady-state toggle/show/hide share one load. */
  modulePromise: Promise<DesignTokenPanelModule> | null;
}

interface ConsoleApiSurface {
  showDesignPanel?: () => Promise<void>;
  hideDesignPanel?: () => Promise<void>;
  toggleDesignPanel?: () => Promise<void>;
  [extra: string]: unknown;
}

type AdapterStateMap = Record<string, DesignTokenPanelAdapterState>;

interface AdapterWindow extends Window {
  __zudoDesignTokenPanelAdapter?: AdapterStateMap;
  [namespace: string]: unknown;
}

function getAdapterStateMap(win: AdapterWindow): AdapterStateMap {
  if (!win.__zudoDesignTokenPanelAdapter) {
    win.__zudoDesignTokenPanelAdapter = {};
  }
  return win.__zudoDesignTokenPanelAdapter;
}

function getAdapterState(win: AdapterWindow, key: string): DesignTokenPanelAdapterState {
  const map = getAdapterStateMap(win);
  let state = map[key];
  if (!state) {
    state = { bound: false, modulePromise: null };
    map[key] = state;
  }
  return state;
}

/** Read one key, treating an unavailable store as an absent value. */
function readStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * True when any of the package's five fixed eager-load flags holds one of its
 * accepted values.
 *
 * Presence alone never activates a flag — `acceptedValues` enumerates the
 * values that count, so a stale `'0'` stays inert — and `requiredConfig`
 * names a `PanelConfig` property that must actually be configured for the
 * flag to mean anything (`-domtweaker-enabled` is inert on this host, which
 * passes no `domTweaker`).
 */
function hasActiveFlagSignal(cfg: PanelConfig): boolean {
  for (const [suffix, rule] of Object.entries(EAGER_LOAD_GATE_KEY_SUFFIXES)) {
    const requiredConfig: keyof PanelConfig | null = rule.requiredConfig;
    if (requiredConfig !== null && cfg[requiredConfig] === undefined) continue;

    const value = readStorageItem(cfg.storagePrefix + suffix);
    if (value !== null && (rule.acceptedValues as readonly string[]).includes(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Apply `EAGER_LOAD_GATE_STATE_FAMILY.valueRules` to one raw envelope:
 *
 *   blank (absent or empty string) -> no      JSON null              -> no
 *   empty object / empty array     -> no      any other parsed value -> yes
 *   malformed JSON                 -> yes
 *
 * "Any other parsed value" includes `false`, `0` and JSON `""` — those are
 * saved values, not absence, and the registry says they activate.
 *
 * Malformed JSON fails OPEN deliberately: a parse failure means the panel
 * must still load so it can migrate or reject the payload, rather than
 * stranding the user with corrupt state they can never reach.
 *
 * Presence alone is not enough because clearing persisted state removes the
 * key rather than writing `{}` — an empty envelope is foreign or hand-written
 * data, not a user's saved tweaks.
 */
function isActiveStateEnvelope(raw: string | null): boolean {
  // An empty string is a blank slot, not corrupt data — `JSON.parse('')`
  // throws, but there is nothing here to migrate.
  if (raw === null || raw === '') return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return true;
  }
  if (parsed === null) return false;
  if (Array.isArray(parsed)) return parsed.length > 0;
  if (typeof parsed === 'object') return Object.keys(parsed).length > 0;
  return true;
}

/**
 * True when any state version the CURRENT loader can read holds a non-empty
 * envelope.
 *
 * The store is enumerated and each key tested with the package's
 * `matchesKey`, which compares complete strings built from the literal
 * prefix — so a sibling instance's `${otherPrefix}-state-v4` cannot match and
 * a host prefix containing regex metacharacters stays inert.
 */
function hasPersistedOverrides(cfg: PanelConfig): boolean {
  try {
    const store = window.localStorage;
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key === null) continue;
      if (!EAGER_LOAD_GATE_STATE_FAMILY.matchesKey(cfg.storagePrefix, key)) continue;
      if (isActiveStateEnvelope(store.getItem(key))) return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function loadPanelModule(state: DesignTokenPanelAdapterState) {
  if (state.modulePromise === null) {
    const pending = import('@takazudo/zdtp').then((mod) => {
      // Configure FIRST — every other panel API reads getPanelConfig() and
      // must observe the host's intended values, not the package sentinel.
      mod.configurePanel(panelConfig);

      // Wire the panel into zfb-runtime's SPA navigation lifecycle.
      // onBeforeSwap: zfb:before-swap fires just before DOM swap — panel uses
      //   this to tear down / re-mount as needed across soft navigations.
      // onPageLoad: zfb:after-swap fires after DOM swap, mirrors astro:page-load
      //   and astro:after-swap — panel re-reads tokens from the new page DOM.
      // Each registration returns an unsubscribe function; panel calls it on
      // teardown. addEventListener is idempotent for the same function ref,
      // but the adapter pattern calls these with new closures each time, so
      // the returned removeEventListener call is the correct cleanup path.
      mod.setLifecycleAdapter({
        onBeforeSwap: (cb) => {
          document.addEventListener('zfb:before-swap', cb);
          return () => document.removeEventListener('zfb:before-swap', cb);
        },
        onPageLoad: (cb) => {
          document.addEventListener('zfb:after-swap', cb);
          return () => document.removeEventListener('zfb:after-swap', cb);
        },
      });

      try {
        mod.reapplyPersistedOverrides();
      } catch (err) {
        // Defensive: never let a bad persist-state read kill the panel surface.
        console.warn(
          '[design-token-panel] reapplyPersistedOverrides() threw: ' + (err as Error).message,
        );
      }
      return mod;
    });

    // A rejected load must NOT stay cached: one failed chunk fetch would
    // otherwise break show/hide/toggle for the rest of the page lifetime.
    // Clear the slot only while it still holds THIS promise, so a retry
    // already in flight is not clobbered.
    void pending.catch(() => {
      if (state.modulePromise === pending) state.modulePromise = null;
    });

    state.modulePromise = pending;
  }
  return state.modulePromise;
}

function installConsoleApi(
  win: AdapterWindow,
  namespace: string,
  state: DesignTokenPanelAdapterState,
): void {
  const existing = (win[namespace] as ConsoleApiSurface | undefined) ?? {};
  existing.showDesignPanel = async () => {
    const panel = await loadPanelModule(state);
    panel.showDesignTokenPanel();
  };
  existing.hideDesignPanel = async () => {
    const panel = await loadPanelModule(state);
    panel.hideDesignTokenPanel();
  };
  existing.toggleDesignPanel = async () => {
    const panel = await loadPanelModule(state);
    panel.toggleDesignPanel();
  };
  win[namespace] = existing;
}

function mountPanel(): void {
  if (typeof window === 'undefined') return;

  const cfg = panelConfig;
  const win = window as unknown as AdapterWindow;
  const state = getAdapterState(win, cfg.storagePrefix);

  // Install console API every time — `bound` only gates the lazy-load
  // probes, since the console handlers are idempotent.
  installConsoleApi(win, cfg.consoleNamespace, state);

  if (state.bound) return;
  state.bound = true;

  if (hasActiveFlagSignal(cfg) || hasPersistedOverrides(cfg)) {
    // Fire-and-forget by design, but with the rejection handled: nothing
    // awaits this promise, and an unhandled rejection from a failed chunk
    // load fails the whole run in a consumer's test runner.
    void loadPanelModule(state).catch((err: unknown) => {
      console.error('[design-token-panel] Eager panel-module load failed.', err);
    });
  }
}

export default function PanelMount() {
  useEffect(() => {
    mountPanel();
    // No cleanup: the panel adapter installs window-level state that lives
    // for the page lifetime. A teardown on unmount would be wrong.
  }, []);
  return null;
}
