#!/usr/bin/env bash
# Wide completion gate: fast harness + Playwright UI E2E + real Worker Hurl smoke.
# Matches the spirit of "test-verified completion" / Stop hooks in Harness Engineering.
# Requires: playwright browsers (pnpm exec playwright install chromium), hurl (see AGENTS.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash scripts/harness-check.sh

echo "== harness:full Playwright =="
pnpm test:e2e

echo "== harness:full API (wrangler + Hurl) =="
pnpm test:api

echo "== harness:full: OK =="
