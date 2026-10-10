#!/usr/bin/env bash
# Reads changed repo paths (one per line) on stdin and prints the ones that
# require the browser suite. No output means the change is content-only.
#
# Relevant: dependency/tooling manifests, zfb + test config, the apply routing
# map, and the source/test/CI trees (pages, components, config, styles,
# plugins, scripts, content, tests, .github) — except pure content
# (*.md / *.mdx).
set -euo pipefail

# grep exits 1 for "no match" (fine) and 2 for a real error (must fail).
candidates=$(grep -E \
  -e '^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc)$' \
  -e '^(zfb\.config\.[cm]?[jt]s|tsconfig\.json|wrangler\.toml|playwright\.config\.ts|scaffold\.routing\.json)$' \
  -e '^(pages|components|config|styles|plugins|scripts|content|tests|\.github)/' \
  || [ $? -eq 1 ])
[ -n "$candidates" ] || exit 0
printf '%s\n' "$candidates" | grep -v -E '\.mdx?$' || [ $? -eq 1 ]
