# ADR 0001: Testing layers and agent harness

- Status: Accepted
- Date: 2026-03-28

## Context

The repo ships a Cloudflare Worker (API + LIFF), a Next.js admin app, and shared packages. Coding agents need a clear, machine-checkable definition of "done" and honest naming of test types.

## Decision

1. **Deterministic gates** for routine changes: worker `tsc --noEmit` and `pnpm test` (see `scripts/harness-check.sh` / `pnpm harness`).
2. **Playwright tests** under `tests/e2e/` validate the admin UI against **mocked** Worker HTTP (`mock-web-api.ts`). They are **UI E2E with a fake API**, not full-stack production E2E.
3. **Worker route correctness** (especially LIFF / webhooks) is primarily enforced by **Vitest** in `apps/worker/tests/`.
4. **Hurl smoke tests** (`pnpm test:api`, `tests/hurl/*.hurl`) run against **`wrangler dev --local`** to assert real HTTP behavior (OpenAPI doc, auth middleware, public HTML). This complements Vitest and is **not** a substitute for staging tests with production-like secrets.
5. **Lefthook** (`lefthook.yml`) may run `pnpm harness` on pre-commit for faster local feedback; CI remains the merge gate.
6. Agent-facing **harness documentation** lives in `.cursor/skills/line-harness-harness/SKILL.md` and short pointers in `AGENTS.md`, not duplicated prose specs.

## Consequences

- CI and `pnpm harness` stay fast and stable; the **`api-integration` job** adds a slower but shallow real-HTTP check (Hurl + local D1).
- Contributors must not claim "E2E covers the API" when only Playwright mocks are used; cite **Vitest**, **Hurl**, or **staging** explicitly.
- `apps/worker/.dev.vars` is gitignored; local and CI use `.dev.vars.example` as the non-secret template.
- Stripe webhooks require `STRIPE_WEBHOOK_SECRET`; unsigned JSON ingestion was removed for security (see `stripe` route tests).
