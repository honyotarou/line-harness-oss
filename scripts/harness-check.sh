#!/usr/bin/env bash
# Deterministic pre-merge gate: TypeScript (worker) + unit tests.
# See AGENTS.md and .cursor/skills/line/SKILL.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== harness: biome format =="
pnpm exec biome format .

echo "== harness: encapsulation (layers / thin routes) =="
node scripts/check-encapsulation.mjs

# CI の unit ジョブと同様: line-sdk / shared の dist を最新にしてから型検査（src だけ更新して dist が古いと誤って赤くなるのを防ぐ）
echo "== harness: build workspace libs (shared + line-sdk dist) =="
pnpm build:libs

echo "== harness: worker typecheck =="
pnpm --filter worker typecheck

echo "== harness: liff typecheck =="
pnpm --filter liff typecheck

echo "== harness: liff production build (dummy VITE_API_URL; real deploys must set a real Worker URL) =="
VITE_API_URL="https://harness.liff.api.invalid" pnpm --filter liff build

echo "== harness: unit tests (worker, web, sdk, liff) =="
pnpm test

echo "== harness: OK =="
