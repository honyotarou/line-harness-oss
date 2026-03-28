#!/usr/bin/env bash
# Local parity with GitHub Actions "unit" job (coverage + SDK tests).
# Slower than pnpm harness; use before push or when debugging CI failures.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== harness:ci (biome format) =="
pnpm exec biome format .

echo "== harness:ci (worker coverage) =="
pnpm --filter worker test:coverage

echo "== harness:ci (web coverage) =="
pnpm --filter web test:coverage

echo "== harness:ci (sdk tests) =="
pnpm --filter @line-harness/sdk test

echo "== harness:ci: OK =="
