# TDD Step 7〜11 + check — ゲート・E2E・API・仕上げ

## Step 7 — 層別ゲート

**目的**: ローカルで決定論的に「完了」を証明する。

推奨順:

1. `pnpm --filter worker typecheck`（Worker を触った場合）
2. 変更したパッケージに限定:  
   `pnpm --filter worker test` / `pnpm --filter web test` / `pnpm --filter @line-harness/sdk test`
3. マージ前または広い変更のとき: ルートで **`pnpm test`**
4. クイック統合: **`pnpm harness`**（`scripts/harness-check.sh` と同等）

**失敗時**: 実装を直す。テストを「合わせるだけ」緩めない（要件が変わった場合はユーザー確認）。

---

## Step 8 — UI 回帰 E2E（Playwright）

**目的**: Next.js 管理画面の回帰を防ぐ。**Worker はモック**（`tests/e2e` のパターン）。

```bash
pnpm test:e2e
```

- 変更が `apps/web` の画面・ナビ・フォームに及ぶとき必須。
- 時間短縮: `pnpm exec playwright test tests/e2e/特定.spec.ts`（必要なら）
- **注意**: この層だけでは **実 Worker・LIFF・Webhook** は検証されない。説明で混同しない（[steps-harness.md](steps-harness.md) 参照）。

---

## Step 9 — API 統合（実 Worker ローカル + Hurl）

**目的**: 本物の Hono ハンドラとミドルウェアが HTTP で期待どおり動くことを確認する。

前提: [Hurl](https://hurl.dev) をインストール済み。

```bash
pnpm test:api
```

- 新規エンドポイントや **認可・OpenAPI ドキュメント**を変えたとき、`tests/hurl/smoke.hurl`（または追加の `.hurl`）を更新する TDD も可: **Hurl を先に書いて Red** → Worker を Green。
- スクリプトは `apps/worker/.dev.vars` を自動生成しうる（`.dev.vars.example` 由来）。

---

## Step 10 — カバレッジ・回帰

**目的**: ホットスポットにテストを足し、無防備な変更を減らす。

```bash
pnpm test:coverage
```

- カバレッジが低い **分岐の多い service / 認可**に、Step 3〜6 でテストを追加する。
- **bench**: `pnpm test:bench`（Worker のパフォーマンス回帰；TDD の必須ではない）

---

## Step 11 — 仕上げ

**目的**: コード以外の「真実」も更新する。

次を必要に応じて確認:

1. **`docs/adr/`** — 設計判断が変わったら短い ADR（Supersede 可）
2. **D1** — `packages/db/migrations/` と `schema.sql` の両方、Worker 側の `wrangler` バインド
3. **セキュリティ境界** — 公開ルート・`authMiddleware`・LIFF の `idToken` / signed `state` 等（既存パターンに合わせる）
4. **`AGENTS.md`** のコマンドと矛盾しないか

本番相当の確認はルート **`AGENTS.md`「本番リリース前チェック」** を参照。

---

## check — 品質ゲート（リリース相当）

次の **いずれか**で、すべて緑を確認してから報告する:

```bash
pnpm harness:full
```

または分割:

```bash
pnpm harness
pnpm test:e2e
pnpm test:api
```

CI の unit ジョブに揃えるなら `pnpm harness:ci` も実行する。

- CI と揃えるなら `.github/workflows/ci.yml` も参照。
- D1 マイグレーションや本番 DB を伴う変更では、さらに **`pnpm db:pre-010-check`** 等（`AGENTS.md`）を実行する。

---

## よくある分岐

| 変更の種類 | 最低限のゲート |
|------------|----------------|
| Worker ルートのみ | `pnpm harness` + 該当 `routes/*.test.ts` |
| Worker + 新 HTTP 契約 | + `pnpm test:api`（Hurl 更新） |
| Web UI | + `pnpm test:e2e`（関連 spec） |
| `packages/db` スキーマ | マイグレーション + worker テスト + ローカル D1 確認 |
| SDK 公開 API | `pnpm --filter @line-harness/sdk test` + 利用側のテスト |
