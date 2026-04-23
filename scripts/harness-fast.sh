#!/usr/bin/env bash
# Fast-path harness for PostToolUse hooks.
#
# Rationale: the full `pnpm harness` runs Biome + encapsulation + lib build + worker typecheck +
# LIFF typecheck + LIFF production build + unit tests for all four packages (~8-10s). That is the
# right gate on Stop / CI, but per-edit it slows TDD velocity.
#
# This script runs only the subset that catches mistakes localized to the just-edited file:
#   Biome format + encapsulation (incl. F1/F4/F5 regression guards + Rule D schema drift)
#   + worker typecheck + worker unit tests.
#
# Skipped here (still enforced on Stop / CI via `pnpm harness` or `pnpm harness:ci`):
#   - LIFF typecheck / production build
#   - web / sdk / liff unit tests
#
# `set -e` means encapsulation failure aborts before typecheck/tests, so red paths stay fast.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== harness-fast: biome format =="
pnpm exec biome format .

echo "== harness-fast: encapsulation (layers / thin routes / scope guards / migration drift) =="
node scripts/check-encapsulation.mjs

echo "== harness-fast: worker typecheck =="
pnpm --filter worker typecheck

echo "== harness-fast: worker unit tests =="
pnpm --filter worker test

echo "== harness-fast: OK =="
