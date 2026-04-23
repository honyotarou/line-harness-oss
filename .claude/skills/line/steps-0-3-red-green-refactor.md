# TDD Step 3〜6 — 観点 → Red → Green → Refactor

**スキル上の位置づけ**: 通常の機能 TDD は **3→4→5→6→7**（Step 7 は [steps-4-8-gates.md](steps-4-8-gates.md)）。**セキュリティ（pentest 枝）**も Red / Green / ゲートの**作法は同じ**で、レールは [steps-pentest-tdd-loop.md](steps-pentest-tdd-loop.md)。

**カプセル化は Step 7 待ちにしない**: Worker / Web のレイヤー・`ROUTE_LINE_CAPS` は **Step 4〜5 と同時進行**で守る。PR の **CI は `format:check` の直後**に `pnpm check:encapsulation` が走る（後からまとめて直させない）。

---

## Step 3 — 観点・受け入れ条件

**目的**: テスト名とファイルパスまで決める。**この段階ではテストコードを書かない**（またはスケルトンのみ）。

エージェントは次を出力する:

1. **スコープ**: 触るパッケージ（`worker` / `web` / `sdk` / `db`）
2. **Given / When / Then**（または表形式の受け入れ条件）
3. **テストの置き場所**:
   - 新規ファイルか既存ファイルか（例: `apps/worker/tests/routes/foo.test.ts` / `apps/worker/tests/services/foo.test.ts`）
4. **モック方針**: `vi.mock('@line-crm/db')` の有無、`fetch` スタブの要否
5. **型・公開 API**: 変える関数・ルート・型の名前

**チェック**:

- [steps-harness.md](steps-harness.md) の「モノレポの地図」と矛盾しないか。
- **新規 HTTP ルート**なら `apps/worker/src/routes/` に置く前提で、**`scripts/check-encapsulation.mjs` の `ROUTE_LINE_CAPS` にファイル名を追加するタスク**を Step 5 のチェックリストに含める。
- **Web の新 API メソッド**なら `catalog/` のどの断片に足すか（`client` 直書きを増やさない）を決める。

---

## Step 4 — Red（失敗するテスト）

**目的**: **意図した理由で**失敗するテストを 1 本以上追加する（コンパイルエラーだけの Red は避ける）。

手順:

1. Step 3 で決めたファイルに **最小の `it` / `describe`** を書く。
2. アサーションは **これから実装する振る舞い**を表す（現状のバグを「緑で固定」しない）。
3. ルートテストは `Hono` の `app.fetch(Request, env, executionCtx)` パターンに合わせる（既存 `apps/worker/tests/routes/*.test.ts` を複製する）。
4. **`pnpm --filter worker test -- path/to/file.test.ts`**（または該当パッケージ）で **赤を確認**してから次へ。
5. ルート・`application`・`apps/web/src/lib/api` を触る変更なら、**この直後**に **`pnpm check:encapsulation`** を実行する。落ちたら **Red の置き場所**（例: ルートに厚い検証を書いていないか）か **Step 3 のスコープ**を直してから Step 5 へ（**「あとでカプセル化」で進めない**）。

**カプセル化のコツ（Red 段階から意識）**:

- **ルートファイルが長くなる Red** を書くより、**`application/` の関数の振る舞い**を Red で表現し、ルートは `app.fetch` で薄く検証する方が、後の `ROUTE_LINE_CAPS` と相性がよい。
- どうしてもルートにロジックを足す場合、Step 5 で **`pnpm check:encapsulation`** が通る行数になるよう **先に抽出**する。

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
4. **新規 `routes/*.ts`** を追加したら **`scripts/check-encapsulation.mjs` の `ROUTE_LINE_CAPS`** にエントリを足す（忘れると CI / Step 7 で即失敗）。
5. レイヤー・行数上限を触ったら **Green のあと再度** **`pnpm check:encapsulation`**（Step 7 まで待たない）。

**DB スキーマを変える場合**: `packages/db/migrations/` と `schema.sql` の整合、`createUser` 等のコードパスを同じ PR で更新し、**Red は DB ヘルパーまたはルート経由**で表現する。**Rule D（`scripts/check-encapsulation.mjs`）が drift を検知**するので、migration の `ALTER TABLE ADD COLUMN` / `CREATE TABLE` は必ず `schema.sql` に同じ列・同じ table を反映（忘れると `pnpm check:encapsulation` が即赤）。

**TDD 反復の内ループ**（Step 4〜6 を回す間）: `pnpm harness:fast`（≒7s — Biome + encapsulation + worker typecheck + worker tests）を使う。**pre-commit に同じ fast が掛かる**ので commit 時に再発見されない。SQL / `schema.sql` を編集したコミットは Lefthook が **自動で full harness にエスカレート**（lib build 付きで Rule D を exercise する）。

---

## Step 6 — Refactor

**目的**: テストを **緑のまま**内部構造を良くする。

- 重複排除、関数名、ファイル分割、早期 return。
- 「変更容易性」を落とす“悪魔”が出ていないかを点検し、**局所的に構造を整える**（大掛かりに作り直さない）。
  - **カプセル化**: 近接するデータ＋ロジックを同じモジュールに寄せ、呼び出し側が生のデータ構造に依存しない形へ。
  - **関心の分離**: 認可 / 入力検証 / 永続化 / 外部 I/O / ドメイン判断を混ぜない（`routes/` は配線、判断は `application/` / `services/`）。
  - **不変・前提の明文化**: “成立しているはず”を `type`・関数境界・小さなバリデータで固定し、後段での if/else 乱立を減らす。
  - **分岐の整理**: 条件分岐が増えたら早期 return、条件の命名、ポリシー関数化（必要なら enum/union + switch）で迷宮化を防ぐ。
  - **名前**: 「何を表すか／何をしないか」が読み取れる名前に寄せ、曖昧語（`data`, `info`, `manage`）で逃げない。
  - **コメント**: “なぜその制約/例外があるか”だけを書く（処理の逐語説明は書かない）。
- **新しい振る舞いは追加しない**（追加するなら Step 3 に戻る）。
- 再度フォーカステスト → 必要なら `pnpm test` で広く確認。

---

## ステップ完了後

必ず **Step 7**（層別ゲート）に進み、**`pnpm harness`** で緑を確認する（中に **カプセル化・LIFF 本番 build・全パッケージの unit** が入る。ルートだけの修正でもここで落ちうる）。**pentest 自走**でもラウンドごとに同じ（[steps-pentest-tdd-loop.md](steps-pentest-tdd-loop.md)）。

---

## よくある失敗（shuusei 流・TDD アンチパターン）

**このサイクルで踏みがちな罠**。出たら直前のステップに戻る:

| アンチパターン | 何が起きる | 戻るべき Step |
|----------------|------------|----------------|
| **Red なしで Green から書き始める** | 「既に通っているだけのテスト」を後付けして緑を装う。回帰が弱まる | Step 4（失敗を目視してから） |
| **コンパイルエラーだけの Red** | 意図した理由で失敗していない。実装後に偶然緑になると仕様が固定されない | Step 4（アサーションが将来の振る舞いを表す形に） |
| **1 Red に複数論点を詰める** | Green の最小差分が決まらず、何が効いたか追えない | Step 3（受け入れ条件を分割） |
| **Green で無関係リファクタを同梱** | レビュー困難・回帰時に bisect 不能 | Step 5（最小差分のみ）→ Step 6 で別コミット |
| **Green 後に `pnpm check:encapsulation` を Step 7 までサボる** | ルート肥大・レイヤー違反を CI で発覚し手戻り | Step 4〜5（変更中に毎回） |
| **新規 `routes/*.ts` を足して `ROUTE_LINE_CAPS` に登録忘れ** | ゲートが即赤。「後で」で通らない | Step 5（追加と同じコミット） |
| **route にロジックを足して cap 超過 → cap を上げる PR** | 設計劣化が蓄積。同じ route に次の変更が落ちにくくなる | Step 5（**`application/` / `services/` に抽出**してから） |
| **Refactor で新しい振る舞いを入れる** | 緑が偽装される。Red なし Green と同じ | Step 6 を止め Step 3 に戻る（新規振る舞いは別サイクル） |
| **`class` / `interface` を使って `check:encapsulation` を赤にする** | 設計ゲートで即停止。SKILL 5.4.1 で明示禁止 | Step 5（関数 + 型エイリアス + Readonly + Branded Type に作法統一） |
| **テストを「合わせるだけ」緩めて緑にする** | 実装バグを緑で固定。要件変更ではないなら **禁止** | Step 5（実装を直す。要件変更ならユーザー確認 → Step 3 に戻る） |
| **harness を `--no-verify` / ガード削除で通す** | セキュリティ不変を削る。本リポでは **禁止** | [steps-harness.md](steps-harness.md) の **「マージゲートが赤いとき」** |

**1 ルール**: 「Red で失敗を目視 → 最小 Green → 緑のまま Refactor → `pnpm harness`」の **どれか 1 つを飛ばしたら**、直前のステップに戻る。**飛ばしたまま完了と呼ばない**。

## 関連（出典）

- **Empirical prompt tuning（本節の アンチパターン表・自己再読禁止原則の出典）**: [`shuusei/SKILL.md`](../shuusei/SKILL.md)。TDD の作法自体は t-wada 系、skill 改訂の評価ループは shuusei。
- **pentest の各ラウンド末ゲート**: [steps-pentest-tdd-loop.md](steps-pentest-tdd-loop.md)（`pnpm harness` と報告フォーマットは同じ）
