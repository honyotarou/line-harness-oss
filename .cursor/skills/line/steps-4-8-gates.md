# TDD Step 7〜11 + check — ゲート・E2E・API・仕上げ

**スキル上の位置づけ**: Step **3〜6** は [steps-0-3-red-green-refactor.md](steps-0-3-red-green-refactor.md)。**pentest（セキュリティ自走）**は [steps-pentest-tdd-loop.md](steps-pentest-tdd-loop.md) がレールだが、**各ラウンドの完了ゲートはこのファイルの Step 7 と同じ `pnpm harness`**。

---

## Step 7 — 層別ゲート

**目的**: ローカルで決定論的に「完了」を証明する（**pentest の各ラウンド末もここ**）。

### マージ相当の一本化（推奨）

```bash
pnpm harness
```

中身は **`scripts/harness-check.sh`** 固定順: **Biome format** → **`node scripts/check-encapsulation.mjs`**（= `pnpm check:encapsulation`）→ Worker typecheck → LIFF typecheck → LIFF 本番 build（dummy `VITE_API_URL`）→ **`pnpm test`**（worker → web → sdk → liff）。

**PR の CI**（`.github/workflows/ci.yml`）も **Biome の直後**に同じ `pnpm check:encapsulation` を実行する（TDD 中と同じ基準をマージ前に強制）。

### 狭い反復（開発中）

1. **`pnpm check:encapsulation`** — ルート・`application`・Web `api/catalog` を触ったとき特に
2. `pnpm --filter worker typecheck`（Worker を触った場合）
3. 変更したパッケージに限定:  
   `pnpm --filter worker test` / `pnpm --filter web test` / `pnpm --filter @line-harness/sdk test` / `pnpm --filter liff test`
4. マージ前または広い変更: 上記の **`pnpm harness`**

**失敗時**: 実装を直す。テストを「合わせるだけ」緩めない（要件が変わった場合はユーザー確認）。**カプセル化で落ちたら** `scripts/check-encapsulation.mjs` のメッセージに従い、レイヤー違反または行数上限を解消する。

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
3. **セキュリティ境界** — 公開ルート・`authMiddleware`・LIFF の `idToken` / signed `state`（実装は `application/liff-identity.ts` / `liff-oauth-*.ts` / `services/liff-oauth-state.ts` 等。既存パターンに合わせる）。攻撃者視点の繰り返しレビューは [steps-pentest-tdd-loop.md](steps-pentest-tdd-loop.md)（**pentest** 枝）。**コード検証済みの残リスク**は同ファイル **「検証済みリスクバックログ」（P1〜P6）** — 未対策なら **Red で先に閉じ**、対策済みなら **`pnpm harness` の Vitest で回帰**しているか確認する。
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
| Worker ルート / `application/` のみ | **`pnpm harness`**（カプセル化込み）+ 該当 `apps/worker/tests/**/*.test.ts`。新規ルートファイルは **`ROUTE_LINE_CAPS` 追記** |
| Worker ルート行数が上限超過 | `application/` または `services/` へ抽出 → 再度 **`pnpm check:encapsulation`** |
| Worker + 新 HTTP 契約 | + `pnpm test:api`（Hurl 更新） |
| Web 管理画面（`api` クライアント含む） | `pnpm harness` 内の web test + `src/lib/api/**/*.test.ts`。**catalog の import 制約**に注意 |
| Web UI（画面・ナビ） | + `pnpm test:e2e`（関連 spec） |
| `apps/liff`（CSP / `VITE_API_URL` / CSS） | **`pnpm harness`**（LIFF typecheck + **本番 build** が含まれる） |
| `packages/db` スキーマ | マイグレーション + `schema.sql` + worker テスト + ローカル D1 確認 |
| SDK 公開 API | `pnpm --filter @line-harness/sdk test` + 利用側のテスト |
