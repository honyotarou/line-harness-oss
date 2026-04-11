# TDD Step 3〜6 — 観点 → Red → Green → Refactor

## Step 3 — 観点・受け入れ条件

**目的**: テスト名とファイルパスまで決める。**この段階ではテストコードを書かない**（またはスケルトンのみ）。

エージェントは次を出力する:

1. **スコープ**: 触るパッケージ（`worker` / `web` / `sdk` / `db`）
2. **Given / When / Then**（または表形式の受け入れ条件）
3. **テストの置き場所**:
   - 新規ファイルか既存ファイルか（例: `apps/worker/tests/routes/foo.test.ts` / `apps/worker/tests/services/foo.test.ts`）
4. **モック方針**: `vi.mock('@line-crm/db')` の有無、`fetch` スタブの要否
5. **型・公開 API**: 変える関数・ルート・型の名前

**チェック**: [steps-harness.md](steps-harness.md) の「モノレポの地図」と矛盾しないか。

---

## Step 4 — Red（失敗するテスト）

**目的**: **意図した理由で**失敗するテストを 1 本以上追加する（コンパイルエラーだけの Red は避ける）。

手順:

1. Step 3 で決めたファイルに **最小の `it` / `describe`** を書く。
2. アサーションは **これから実装する振る舞い**を表す（現状のバグを「緑で固定」しない）。
3. ルートテストは `Hono` の `app.fetch(Request, env, executionCtx)` パターンに合わせる（既存 `apps/worker/tests/routes/*.test.ts` を複製する）。
4. **`pnpm --filter worker test -- path/to/file.test.ts`**（または該当パッケージ）で **赤を確認**してから次へ。

**Worker のコツ**:

- **ロジックの追加・変更**は `apps/worker/src/application/*.ts` に置き、**`routes/*.ts` は配線**に留める（既存の LIFF / Webhook / Calendar / OpenAPI がこのパターン）。
- テスト: ルートは `Hono` の `app.fetch(Request, env, executionCtx)`（`apps/worker/tests/routes/*.test.ts` を複製）。`application/` の分岐だけなら `tests/services/` 等で切り出してよい。
- `vi.hoisted(() => ({ ... }))` で `vi.mock` 用のモックを先に定義する（既存ルートテストに合わせる）。
- グローバル `fetch` を触る場合は `afterEach` / `beforeEach` で `vi.unstubAllGlobals()`。

**Web のコツ**:

- `apps/web` は Vitest；対象モジュールの import をテストから行い、**DOM に依存しないロジック**を優先して TDD する。
- 管理画面の Worker 呼び出しを増やすときは **`src/lib/api/catalog/`** にドメイン別メソッドを足し、**`src/lib/api/index.ts`（再 export）**と既存ページの `@/lib/api` import を壊さないようにする。

**禁止**: このステップで「とりあえず実装を入れて緑にする」こと（それは Step 5）。

---

## Step 5 — Green（最小実装）

**目的**: Step 4 のテストを **満たす最小差分**で通す。

手順:

1. 実装を追加・変更する（ルール: 無関係なリファクタ禁止）。
2. 同じフォーカスコマンドで **緑**を確認。
3. 必要なら **型**: `pnpm --filter worker typecheck`

**DB スキーマを変える場合**: `packages/db/migrations/` と `schema.sql` の整合、`createUser` 等のコードパスを同じ PR で更新し、**Red は DB ヘルパーまたはルート経由**で表現する。

---

## Step 6 — Refactor

**目的**: テストを **緑のまま**内部構造を良くする。

- 重複排除、関数名、ファイル分割、早期 return。
- **新しい振る舞いは追加しない**（追加するなら Step 3 に戻る）。
- 再度フォーカステスト → 必要なら `pnpm test` で広く確認。

---

## ステップ完了後

必ず **Step 7**（層別ゲート）に進み、`pnpm harness` で緑を確認する。
