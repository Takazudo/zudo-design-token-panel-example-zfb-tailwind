"use client";

/**
 * TabsDemo — 3-tab horizontal nav with animated active indicator.
 *
 * Token consumption:
 *   flex gap-hsp-md border-b border-muted  → tab container
 *   px-hsp-md py-vsp-sm text-body text-muted  → resting tab label
 *   text-accent  → active tab label
 *
 * Indicator animation:
 *   transform: translateX(...)  driven by var(--zfbtw-easing-tab-open)
 *   width = 100%/tabCount via inline style (reason: dynamic from runtime tab count —
 *   no static Tailwind utility can express a fraction of parent from a variable count)
 *
 * Accessibility: WAI-ARIA Tabs APG pattern with automatic activation.
 *   https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
 */

import { signal, computed, type Ref } from '@takazudo/zfb/zudo-react';
import { Island } from '@takazudo/zfb';

const TABS = ['Overview', 'Details', 'Settings'] as const;

// Exported so zfb's island scanner registers it in the hydration manifest:
// `<Island>` emits a `data-zfb-island="TabsInner"` marker (named after the
// child component), and the runtime resolves that name only for exported
// "use client" components reachable from pages/. (zfb >= 0.1.0-next.x)
export function TabsInner({ baseId }: { baseId: string }) {
  const activeIndex = signal(0);
  const tabCount = TABS.length;
  const indicatorPct = 100 / tabCount;

  const tabIds = TABS.map((_, i) => `${baseId}-tab-${i}`);
  const panelIds = TABS.map((_, i) => `${baseId}-panel-${i}`);
  // ref array for programmatic focus on keyboard navigation
  const tabRefs = TABS.map((): Ref<HTMLButtonElement> => ({ current: null }));

  const onKeyDown = (e: KeyboardEvent) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (activeIndex.value + 1) % tabCount;
    else if (e.key === 'ArrowLeft') next = (activeIndex.value - 1 + tabCount) % tabCount;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabCount - 1;
    if (next === -1) return;
    e.preventDefault(); // prevent page scroll on arrow/home/end keys
    activeIndex.value = next;
    tabRefs[next]?.current?.focus();
  };

  return (
    <div>
      {/* Tab list */}
      <div class="relative flex gap-hsp-md border-b border-muted" role="tablist" on:keydown={onKeyDown}>
        {TABS.map((tab, i) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={tabIds[i]}
            aria-selected={computed(() => activeIndex.value === i)}
            aria-controls={panelIds[i]}
            tabindex={computed(() => activeIndex.value === i ? 0 : -1)}
            on:click={() => { activeIndex.value = i; }}
            class={computed(() => `px-hsp-md py-vsp-sm text-body cursor-pointer border-none bg-transparent ${
              activeIndex.value === i ? 'text-accent font-semibold' : 'text-muted'
            }`)}
            ref={tabRefs[i]}
          >
            {tab}
          </button>
        ))}
        {/*
          Active-tab indicator: absolutely-positioned 2px bar that slides
          via translateX. Width = 100% / tabCount (reason: dynamic value
          computed from tab count at runtime; no static Tailwind fraction).
          Transition timing uses semantic easing-tab-open token.
        */}
        <span
          class="absolute bottom-0 h-[2px] bg-accent"
          aria-hidden="true"
          // reason: width is 1/N of container from runtime tab count; transition
          // timing references semantic easing token not expressible as a Tailwind utility
          style={computed(() => ({
            width: `${indicatorPct}%`,
            transform: `translateX(${activeIndex.value * 100}%)`,
            transition: `transform 0.25s var(--zfbtw-easing-tab-open)`,
          }))}
        />
      </div>

      {/* Tab panels — all rendered, toggled via hidden attribute */}
      <div
        role="tabpanel"
        id={panelIds[0]}
        aria-labelledby={tabIds[0]}
        hidden={computed(() => activeIndex.value !== 0)}
        class="px-hsp-md py-vsp-md text-body text-fg"
      >
        <p>
          <strong>Overview panel.</strong> Indicator slides on{' '}
          <code>easing-tab-open</code>{' '}
          (→&nbsp;<code>--zfbtw-easing-tab-open</code>).
        </p>
      </div>
      <div
        role="tabpanel"
        id={panelIds[1]}
        aria-labelledby={tabIds[1]}
        hidden={computed(() => activeIndex.value !== 1)}
        class="px-hsp-md py-vsp-md text-body text-fg"
      >
        <p>
          <strong>Details panel.</strong> Change the{' '}
          <em>Tab Open</em> easing in the panel to see the indicator motion update.
        </p>
      </div>
      <div
        role="tabpanel"
        id={panelIds[2]}
        aria-labelledby={tabIds[2]}
        hidden={computed(() => activeIndex.value !== 2)}
        class="px-hsp-md py-vsp-md text-body text-fg"
      >
        <p>
          <strong>Settings panel.</strong> Active label uses{' '}
          <code>text-accent</code>{' '}
          (→&nbsp;<code>--zfbtw-color-accent</code>).
        </p>
      </div>
    </div>
  );
}

export function TabsDemo() {
  return (
    <Island when="visible" ssrFallback={null}>
      <TabsInner baseId="zfbtw-widget-tabs" />
    </Island>
  );
}
