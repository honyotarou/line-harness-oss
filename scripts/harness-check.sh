#!/usr/bin/env bash
# Deterministic pre-merge gate: TypeScript (worker) + unit tests.
# See AGENTS.md and .cursor/skills/line-harness-harness/SKILL.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== harness: worker typecheck =="
pnpm --filter worker typecheck

echo "== harness: unit tests (worker, web, sdk) =="
pnpm test

echo "== harness: OK =="
