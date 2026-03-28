---
name: line
description: >-
  LINE Harness OSS をテスト駆動で進める番号選択ワークフロー（Red → Green → Refactor、
  層別ゲート、Playwright、Hurl API 統合）。
  Use when the user says /line, /tdd, テスト駆動開発, TDD,
  red-green-refactor, failing test first, or wants to add behavior via tests in this repo.
---

# LINE Harness OSS — テスト駆動開発（TDD）

番号選択で工程を実行する。引数なしならメニュー表示。**実装より先に失敗するテスト**を正とする。

```
LINE Harness OSS — TDD:

  0  観点・受け入れ条件   要件 → Given/When/Then + 置き場所（テストコードは書かない）
  1  Red                 失敗するテストのみ追加（Vitest / Playwright）
  2  Green               最小実装でテストを緑にする
  3  Refactor            重複除去・命名・分割（テストは緑のまま）
  4  層別ゲート          typecheck + 触ったパッケージの test → 必要なら pnpm test 全体
  5  UI 回帰 E2E         Playwright（API はモック；層を混同しない）
  6  API 統合            pnpm test:api（実 Worker ローカル + Hurl）
  7  カバレッジ・回帰    pnpm test:coverage / ホットスポットにテスト追加
  8  仕上げ              ADR・D1 連鎖・セキュリティ境界の確認
  check  品質ゲート      pnpm harness + test:e2e + test:api（リリース相当）

番号を入力してください:
```

## 先に読む（このリポジトリの前提）

- **[line-harness-harness](../line-harness-harness/SKILL.md)** — ハーネス全体像・E2E の層分け・完了条件（**TDD でも最終的にここに収束**）
- ルート **`AGENTS.md`** — コマンド一覧・本番前チェック

## アーキテクチャ（テストの置き場所）

```
apps/worker/tests/          ← Worker：routes / middleware / services（Vitest）
apps/web/src/**/*.test.ts   ← Web：lib・ユーティリティ中心（Vitest）
packages/sdk/tests/         ← SDK（Vitest）
tests/e2e/                  ← Playwright（Next；Worker API はモック）
tests/hurl/*.hurl           ← 実 Worker への HTTP スモーク（pnpm test:api）
packages/db/                ← スキーマ・マイグレーション（変更時はマイグレーション + 必要なら worker テスト）
```

依存の薄い順にテストしやすい：**純粋関数 → service → route（Hono fetch）→ E2E / Hurl**。

## 必須ルール（全ステップ共通）

### TDD の順序
- **Red が無い Green は禁止**（バグ修正で既存テストが赤なら、先にテストを直すか期待値を要件で確定してから）。
- 1 つのユーザーストーリーあたり、まず **1 本の失敗テスト**から始め、緑になったら次の観点を足す。
- **実装と無関係なリファクタ**はユーザーの明示がない限りしない（ユーザールールに従う）。

### このリポジトリ固有
- **E2E（Playwright）** は「システム全体 E2E」ではない。**UI + モック API** 層。実 Worker の挙動は **Vitest（ルート）** と **`pnpm test:api`** で担保する。
- Worker の **`liff` / `webhook` / `forms` / 認可** は回帰コストが高い。**Red は Vitest のルートテストを優先**し、E2E だけに頼らない。
- `@line-crm/db` 等は **`vi.mock`** で差し替え、**D1 の実 DB** は API 統合スクリプト経由のローカル D1 に任せる（単体では決定論を優先）。
- 外部 API（LINE `fetch` 等）は **スタブ**し、**契約（URL・メソッド・ステータス）** をテストに固定する。

### 完了の定義
- タスク完了報告の前に **`pnpm harness`** を実行し緑であること（変更が web/sdk に及ぶ場合は **`pnpm test`** 全体）。
- 管理画面やルーティングを触ったら **`pnpm test:e2e`**（時間短縮は関連 spec のみ可）。
- Worker の HTTP ハンドラ・ミドルウェアの振る舞いを変えたら **`pnpm test:api`** を推奨。

## ステップ詳細（参照ファイル）

- [steps-0-3-red-green-refactor.md](steps-0-3-red-green-refactor.md) — Step 0〜3（観点 → Red → Green → Refactor）
- [steps-4-8-gates.md](steps-4-8-gates.md) — Step 4〜8 + `check`（ゲート・E2E・API・カバレッジ・仕上げ）

## ルール（GAS スキルと同型）

- 各ステップは **直前ステップの成果物**が前提。未達なら先行ステップを案内する。
- 番号は **0 → 1 → 2 → 3** を基本とし、その後 **4** を通してから **5 / 6** を必要に応じて実行する。**8** または **check** でリリース相当の確認をする。
- ユーザーが「テストだけ」「実装だけ」と言い分けた場合は従うが、**TDD スキルの既定は常に Red 先行**。
