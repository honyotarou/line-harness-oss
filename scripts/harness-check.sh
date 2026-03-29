#!/usr/bin/env bash
# Deterministic pre-merge gate: TypeScript (worker) + unit tests.
# See AGENTS.md and .cursor/skills/line/SKILL.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== harness: biome format =="
pnpm exec biome format .

echo "== harness: worker typecheck =="
pnpm --filter worker typecheck

echo "== harness: liff typecheck =="
pnpm --filter liff typecheck

echo "== harness: unit tests (worker, web, sdk) =="
pnpm test

echo "== harness: OK =="
