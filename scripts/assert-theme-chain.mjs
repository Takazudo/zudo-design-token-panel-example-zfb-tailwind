#!/usr/bin/env node
/**
 * Assert the `@theme` chain survived the build, over the BUILT CSS.
 *
 * Why this exists
 * ---------------
 * zfb wraps a native binary that embeds its own Tailwind compiler, so the
 * `@theme` block in styles/global.css is compiled by a build TOOL, not by a
 * declared npm dependency this repo controls. If a zfb upgrade changed how it
 * feeds that block to Tailwind, the utility layer would come out EMPTY — and
 * every route would still return 200 with a well-formed page. Nothing else in
 * this repo notices: `zfb build` succeeds, `zfb check` passes, the CI routing
 * matrix asserts `<title>`s that do not depend on any utility class. That is
 * the silent failure this script exists to make loud.
 *
 * What it asserts, per row of the chain
 * -------------------------------------
 *   1. the utility rule exists AND declares the right property from the right
 *      theme var  (`.gap-vsp-lg { gap: var(--spacing-vsp-lg) }`)
 *   2. the theme layer resolves that var back to this repo's raw token
 *      (`:root { --spacing-vsp-lg: var(--zfbtw-vsp-lg) }`)
 *
 * Both halves are needed: a present selector with a hard-coded value, or a
 * theme var that no utility consumes, are each a broken chain that a
 * selector-only grep would pass.
 *
 * `.h-size-header-h` is the load-bearing row. The other three are also covered
 * at runtime by tests/token-tweak-style.spec.ts, but the `--spacing-size-*`
 * namespace has NO spec coverage at all — it is the one part of the @theme
 * block that could vanish with nothing else noticing.
 *
 * The three namespaces are genuinely distinct (`--spacing-*`, `--text-*`,
 * `--spacing-size-*`); asserting only one would leave two thirds uncovered.
 *
 * Usage
 * -----
 *   node scripts/assert-theme-chain.mjs [path/to/built.css]
 *   node scripts/assert-theme-chain.mjs --self-test [path/to/built.css]
 *
 * `--self-test` runs the assertions against deliberately mangled copies of the
 * real built CSS and requires every one of them to FAIL, plus a minified copy
 * that must still PASS. It guards against the worst outcome for a check like
 * this: one that can no longer fail, and so reports green forever.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** One row of the token -> @theme -> utility chain. */
const CHAIN = [
  {
    utility: "gap-vsp-lg",
    property: "gap",
    themeVar: "--spacing-vsp-lg",
    rawVar: "--zfbtw-vsp-lg",
    namespace: "--spacing-*",
  },
  {
    utility: "px-hsp-md",
    property: "padding-inline",
    themeVar: "--spacing-hsp-md",
    rawVar: "--zfbtw-hsp-md",
    namespace: "--spacing-*",
  },
  {
    utility: "text-scale-xs",
    property: "font-size",
    themeVar: "--text-scale-xs",
    rawVar: "--zfbtw-scale-xs",
    namespace: "--text-*",
  },
  {
    utility: "h-size-header-h",
    property: "height",
    themeVar: "--spacing-size-header-h",
    rawVar: "--zfbtw-size-header-h",
    namespace: "--spacing-size-*",
  },
];

const ASSETS_DIR = "dist/assets";

function escapeRe(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whitespace/minification tolerance lives here and nowhere else: comments go,
 * then every whitespace run collapses to a single space. Downstream patterns
 * then only need `\s*` to match both `zfb build`'s pretty output and a
 * minified one-liner.
 */
function normalize(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");
}

/** Bodies of every rule whose selector list contains this exact class. */
function ruleBodiesFor(css, className) {
  // `(?<![\w.#-])` rejects `.foo.gap-vsp-lg` and `.x-gap-vsp-lg`; `(?![\w-])`
  // rejects `.gap-vsp-lg-2`. The optional `,...` tail keeps the check working
  // if a future Tailwind groups the utility into a selector list.
  const re = new RegExp(
    `(?<![\\w.#-])\\.${escapeRe(className)}(?![\\w-])(?:\\s*,[^{}]*?)?\\s*\\{([^{}]*)\\}`,
    "g",
  );
  return [...css.matchAll(re)].map((m) => m[1]);
}

/** Bodies of every rule whose selector list contains `:root`. */
function rootRuleBodies(css) {
  const re = /(?<![\w-]):root(?![\w-])[^{}]*?\{([^{}]*)\}/g;
  return [...css.matchAll(re)].map((m) => m[1]);
}

/** `prop: var(--x)` — tolerating a var() fallback, rejecting `row-gap` for `gap`. */
function declaresVar(body, property, varName) {
  const re = new RegExp(
    `(?:^|[;{\\s])${escapeRe(property)}\\s*:\\s*var\\(\\s*${escapeRe(varName)}\\s*[,)]`,
  );
  return re.test(body);
}

/** Collect failures rather than throwing, so one run reports the whole chain. */
function checkChain(rawCss) {
  const css = normalize(rawCss);
  const failures = [];
  const rootBodies = rootRuleBodies(css);

  for (const row of CHAIN) {
    const bodies = ruleBodiesFor(css, row.utility);
    if (bodies.length === 0) {
      failures.push(
        `.${row.utility} — utility rule is MISSING from the built CSS (namespace ${row.namespace}).`,
      );
    } else if (!bodies.some((b) => declaresVar(b, row.property, row.themeVar))) {
      failures.push(
        `.${row.utility} — rule exists but does not declare \`${row.property}: var(${row.themeVar})\`; ` +
          `got \`${bodies[0].trim()}\`.`,
      );
    }

    if (!rootBodies.some((b) => declaresVar(b, row.themeVar, row.rawVar))) {
      failures.push(
        `${row.themeVar} — no :root declaration resolving it to \`var(${row.rawVar})\`; ` +
          `the @theme block did not reach the built CSS.`,
      );
    }
  }
  return failures;
}

function findBuiltCss(explicitPath) {
  if (explicitPath) return explicitPath;
  let entries;
  try {
    entries = readdirSync(ASSETS_DIR).filter(
      (f) => f.startsWith("styles-") && f.endsWith(".css"),
    );
  } catch {
    throw new Error(
      `${ASSETS_DIR}/ does not exist — run \`pnpm build\` before this check.`,
    );
  }
  if (entries.length !== 1) {
    // Filenames are content-hashed per build, so this must be discovered, and
    // a stale file left beside a fresh one would make the check ambiguous.
    throw new Error(
      `expected exactly one ${ASSETS_DIR}/styles-*.css, found ${entries.length}: ${entries.join(", ")}`,
    );
  }
  return join(ASSETS_DIR, entries[0]);
}

/**
 * Mangled variants of the real built CSS. Each MUST make checkChain() fail —
 * if one passes, the assertion above has stopped asserting.
 *
 * The surgery is regex-based, with the same `\s*` tolerance as the checker, so
 * these keep working if `zfb build` ever emits minified CSS. A mangle that
 * matched nothing would prove nothing, so the self-test loop additionally
 * rejects any variant that came back byte-identical.
 */
function mangles(css) {
  const first = CHAIN[0];
  const last = CHAIN[CHAIN.length - 1];
  const utilitiesLayerAt = css.indexOf("@layer utilities");

  const selectorRe = new RegExp(
    `(?<![\\w.#-])\\.${escapeRe(last.utility)}(?![\\w-])`,
  );
  const utilityDeclRe = new RegExp(
    `(${escapeRe(last.property)}\\s*:\\s*)var\\(\\s*${escapeRe(last.themeVar)}\\s*\\)`,
  );
  const themeDeclRe = (row) =>
    new RegExp(
      `${escapeRe(row.themeVar)}\\s*:\\s*var\\(\\s*${escapeRe(row.rawVar)}\\s*\\)\\s*;?`,
    );

  return [
    {
      name: `.${last.utility} selector renamed (missing utility)`,
      css: css.replace(selectorRe, `.${last.utility}-gone`),
    },
    {
      name: `.${last.utility} value hard-coded (chain cut at the utility)`,
      // Function form, not "$13.5rem": `$13` would read as capture group 13.
      css: css.replace(utilityDeclRe, (_m, prefix) => `${prefix}3.5rem`),
    },
    {
      name: `${last.themeVar} theme declaration deleted (chain cut at @theme)`,
      css: css.replace(themeDeclRe(last), ""),
    },
    {
      name: `${first.themeVar} re-pointed away from ${first.rawVar}`,
      css: css.replace(themeDeclRe(first), `${first.themeVar}: 2rem;`),
    },
    {
      name: "whole utilities layer emptied (the silent zfb-upgrade failure)",
      // -1 would make slice() drop a single character, i.e. a mangle that is
      // not a mangle. The no-op guard in the self-test loop catches that, but
      // this says WHY rather than leaving the reader to work it out.
      css: utilitiesLayerAt === -1 ? css : css.slice(0, utilitiesLayerAt),
    },
  ];
}

/** Aggressive minifier — the positive control for whitespace tolerance. */
function minify(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};:,])\s*/g, "$1")
    .trim();
}

function main() {
  const args = process.argv.slice(2);
  const selfTest = args.includes("--self-test");
  const cssPath = findBuiltCss(args.find((a) => !a.startsWith("--")));
  const css = readFileSync(cssPath, "utf8");

  if (selfTest) {
    let bad = 0;
    for (const variant of mangles(css)) {
      // The mangles are string surgery on `zfb build`'s current output shape.
      // If that shape changes (minified output, a renamed layer), a mangle can
      // silently become a no-op and then "fails as required" would be proving
      // nothing. Catch it here rather than shipping a self-test that passes on
      // an unmodified copy.
      if (variant.css === css) {
        console.error(
          `SELF-TEST FAIL: mangle was a no-op, so it proves nothing — ${variant.name}. ` +
            "The built CSS no longer has the shape these mangles assume; update mangles().",
        );
        bad += 1;
        continue;
      }
      const failures = checkChain(variant.css);
      if (failures.length === 0) {
        console.error(
          `SELF-TEST FAIL: mangled CSS still passed — ${variant.name}`,
        );
        bad += 1;
      } else {
        console.log(`  self-test ok (failed as required): ${variant.name}`);
      }
    }
    const minified = checkChain(minify(css));
    if (minified.length > 0) {
      console.error(
        "SELF-TEST FAIL: minified CSS was rejected — the check is not whitespace-tolerant:\n" +
          minified.map((f) => `    - ${f}`).join("\n"),
      );
      bad += 1;
    } else {
      console.log("  self-test ok (passed as required): minified copy");
    }
    if (bad > 0) {
      console.error(
        `\n@theme chain SELF-TEST FAILED (${bad}) — the assertion below cannot be trusted.`,
      );
      process.exit(1);
    }
    console.log("@theme chain self-test passed: the check fails when it should.\n");
  }

  const failures = checkChain(css);
  if (failures.length > 0) {
    console.error(`\n@theme chain BROKEN in ${cssPath}:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error(
      "\nThis is the silent failure mode: every route still returns 200 with the\n" +
        "utility layer empty. Do not ignore this — compare against the pre-bump\n" +
        "capture before changing anything here.\n",
    );
    process.exit(1);
  }

  console.log(`@theme chain intact in ${cssPath}:`);
  for (const row of CHAIN) {
    console.log(
      `  .${row.utility} { ${row.property}: var(${row.themeVar}) }  <-  ${row.themeVar}: var(${row.rawVar})  [${row.namespace}]`,
    );
  }
}

try {
  main();
} catch (err) {
  console.error(`@theme chain check could not run: ${err.message}`);
  process.exit(1);
}
