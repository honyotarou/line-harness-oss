#!/usr/bin/env bash
# Local parity with GitHub Actions "unit" job (coverage + SDK tests).
# Slower than pnpm harness; use before push or when debugging CI failures.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== harness:ci (biome format) =="
pnpm exec biome format .

echo "== harness:ci (liff typecheck) =="
pnpm --filter liff typecheck

echo "== harness:ci (liff production build) =="
VITE_API_URL="https://harness.liff.api.invalid" pnpm --filter liff build

echo "== harness:ci (liff vitest) =="
pnpm --filter liff test

echo "== harness:ci (workspace libs dist for Next bundle) =="
pnpm build:libs

echo "== harness:ci (web next build) =="
pnpm --filter web build

echo "== harness:ci (worker coverage) =="
pnpm --filter worker test:coverage

echo "== harness:ci (web coverage) =="
pnpm --filter web test:coverage

echo "== harness:ci (sdk tests) =="
pnpm --filter @line-harness/sdk test

echo "== harness:ci: OK =="
