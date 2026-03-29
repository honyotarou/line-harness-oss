#!/usr/bin/env bash
# Automated slice of staging verification + LIFF manual reminder.
# Usage:
#   STAGING_WORKER_URL=https://your-worker.workers.dev bash scripts/liff-staging-smoke.sh
# Optional: STAGING_LIFF_URL=https://your-liff.pages.dev  (checks index.html has lh-api-base)
set -euo pipefail

BASE="${STAGING_WORKER_URL:?Set STAGING_WORKER_URL to your deployed Worker origin (no trailing slash)}"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "== liff-staging-smoke: HTTP checks against $BASE =="

code="$(curl -sfS -o "$TMP" -w "%{http_code}" "$BASE/openapi.json")"
if [ "$code" != "200" ]; then
  echo "openapi.json expected 200, got $code" >&2
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  jq -r '.info.title' "$TMP"
fi

code="$(curl -sfS -o /dev/null -w "%{http_code}" "$BASE/docs")"
if [ "$code" != "200" ]; then
  echo "/docs expected 200, got $code" >&2
  exit 1
fi

echo "== liff-staging-smoke: HTTP OK =="

if [ -n "${STAGING_LIFF_URL:-}" ]; then
  echo "== liff-staging-smoke: LIFF index (lh-api-base must point to https Worker) =="
  code="$(curl -sfS -o "$TMP" -w "%{http_code}" "${STAGING_LIFF_URL%/}/")"
  if [ "$code" != "200" ]; then
    echo "LIFF index expected 200, got $code ($STAGING_LIFF_URL)" >&2
    exit 1
  fi
  if ! grep -qE '<meta[^>]+name="lh-api-base"[^>]+content="https?://' "$TMP"; then
    echo "LIFF index missing lh-api-base meta with http(s) URL. Rebuild with VITE_API_URL set." >&2
    exit 1
  fi
  echo "== liff-staging-smoke: LIFF HTML OK =="
fi

echo ""
echo "Manual (LINE app / LIFF):"
echo "  1. Open the staging LIFF URL from the LINE client (same channel as staging bot)."
echo "  2. Complete LINE Login; confirm redirect stays on allowed domains only."
echo "  3. Confirm booking/profile flows call POST /api/liff/profile with idToken + lineUserId."
echo "  4. Confirm another LINE account cannot hijack an arbitrary existingUuid / state uid."
echo ""
