---
name: line
description: >-
  LINE Harness OSS の統合ワークフロー（/line）。入口は番号 0〜12・`check`・キーワード `pentest` / `orthopedics`（セクション 1 と同列）。デザイン 0・1→ハーネス 2→TDD 3〜6→ゲート 7〜11（`check` は harness→e2e→test:api）→デプロイ 12。
  Cloudflare Worker、LIFF、Next 管理画面、カプセル化、pnpm harness、TDD、ペネトレ（steps-pentest-tdd-loop）、デプロイ。
  Playwright E2E はモック API（本物の Worker 契約は Vitest + test:api）。Use when: /line, /tdd, /pentest-tdd-loop, LINE CRM, line-harness-oss, デザイン壁打ち, リッチメニュー, harness, pentest, ペネトレ, orthopedics, check, deploy, e2e, test:api.
  Major edits: Iteration 0（description とセクション 1 の整合）→ 任意で empirical 評価は ../shuusei/SKILL.md（/shuusei、別 subagent・シナリオ）。
---

# LINE Harness OSS（`/line`）

**Cursor**: 正本は **`.cursor/skills/line/SKILL.md`**。スラッシュ **`/line`** から来た場合もここを Read する。**最初に読む `steps-*` はセクション 6.2 の表だけで決める**（`steps-*.md` を glob 列挙してから選ばない）。

**やること**: 下のメニューから **番号**または **キーワード**（`pentest` / `orthopedics`）を選ぶ → **対応する `steps-*.md` を Read**（このファイルは索引。長文は置かない）。

---

## 1. メニュー（入口だけ）

| 種類 | 選び方 |
|------|--------|
| **番号** | `0`〜`12`、または `check` |
| **名前** | `orthopedics` / `pentest`（番号と同列の別入口） |

```
【デザイン・要件】親は 0 と 1 のみ
  0   ビジュアル・トークン → steps-design-0-1.md（Step 0）
      リッチ枝 → steps-rich-menu-wallball.md
  1   要件・8 Round・ブランド → steps-design-0-1.md（Step 1）+ steps-brand-1-5.md
      （Step 1 先頭: エディタでマルチモデル切替する場合は domain-extractor 型の指示あり）

【ドメイン枝】
  orthopedics   整形外科壁打ち → steps-orthopedics-wallball.md

【セキュリティ】（TDD 本線の Step 番号は pentest 正本の対応表に従う）
  pentest       攻撃者視点・自走ループ → steps-pentest-tdd-loop.md または /pentest-tdd-loop

【ハーネス】0・1 の直後や実装前に推奨
  2   Biome・カプセル化・型・unit → steps-harness.md
      ※ harness が赤いときの分岐の正本もこのファイル「マージゲートが赤いとき」

【TDD・機能追加】
  3 観点 / 4 Red / 5 Green / 6 Refactor → steps-0-3-red-green-refactor.md
  7〜11・check → steps-4-8-gates.md（7=pnpm harness まで含む完了条件）

【デプロイ】
  12  本番手順（手順内 0〜9 は deploy 専用）→ steps-deploy.md
  check  harness → e2e → test:api → steps-4-8-gates.md
```

---

## 2. `steps-*` 早見表

| ファイル | 中身 |
|----------|------|
| [steps-design-0-1.md](steps-design-0-1.md) | 親 **0** / **1** |
| [steps-rich-menu-wallball.md](steps-rich-menu-wallball.md) | 親 0・リッチ |
| [steps-brand-1-5.md](steps-brand-1-5.md) | 親 1・ブランド |
| [steps-orthopedics-wallball.md](steps-orthopedics-wallball.md) | orthopedics |
| [steps-pentest-tdd-loop.md](steps-pentest-tdd-loop.md) | **pentest 正本**（チェックリスト・自走）。分岐表は [steps-harness.md](steps-harness.md) へ |
| [steps-harness.md](steps-harness.md) | Step **2**・ゲート一覧・**マージゲートが赤いとき**・E2E 層・[4.1 定期観測](steps-harness.md)（Modifius 型 CI テンプレ） |
| [steps-0-3-red-green-refactor.md](steps-0-3-red-green-refactor.md) | Step **3〜6** |
| [steps-4-8-gates.md](steps-4-8-gates.md) | Step **7〜11**・check |
| [steps-deploy.md](steps-deploy.md) | Step **12** |

**その他**: [AGENTS.md](../../../AGENTS.md)、[docs/adr/](../../../docs/adr/)。

---

## 3. リポジトリ地図（ルール優先）

| 場所 | 役割 |
|------|------|
| `apps/worker/src/application/` | ユースケース（**Hono / routes を import しない**） |
| `apps/worker/src/routes/` | HTTP アダプタ（薄く） |
| `apps/worker/src/services/` | ドメイン・ポリシー |
| `apps/worker/tests/` | Worker Vitest |
| `apps/web/src/lib/api/client.ts` + `catalog/` | 管理 API クライアント（**client は catalog を import しない**） |
| `apps/liff/src/` | LIFF（API 基底・build 時ガード） |
| `tests/e2e/` | Playwright（**API モック**） |
| `tests/hurl/` | `pnpm test:api`（実 Worker） |
| `packages/db`, `packages/shared`, `packages/sdk`, `packages/line-sdk`, `docs/design/` | DB・共有・公開 SDK（`@line-harness/sdk`）・LINE プラットフォーム SDK・デザイントークン |

---

## 4. 実装前提（1 行ずつ）

| 領域 | メモ |
|------|------|
| Worker | 振る舞いは `application/`・`services/`。`routes/` は配線。 |
| マルチアカウント | `line_accounts`・スコープ・Webhook destination |
| LIFF | `/auth/*`、`POST /api/liff/*`、CSP |
| セキュリティ | 管理セッション、CF Access 任意、LIFF state／リダイレクト、Bot／ホスト |
| DB | `schema.sql` と `migrations/` を同じ変更単位。**本番 D1 の遅れ**は運用論点 → `AGENTS.md` |
| カプセル化 | `pnpm check:encapsulation`。新規 `routes/*.ts` は **`ROUTE_LINE_CAPS`**。加えて **`class` / `interface` 禁止**の TS 設計ゲートも毎回走る |
| **harness が赤い** | 分岐の正本 → [steps-harness.md](steps-harness.md) **「マージゲートが赤いとき」** |

### 4.1 批判レビューで固定した注意点（このリポの現状）

設計は ADR・`steps-*` が正本。ここは **エージェントが誤解しやすい点**だけ短く固定する。

- **E2E の意味**: `tests/e2e/` の Playwright は **管理 UI＋モック Worker**。フルスタックや本物の HTTP 契約の証明にはならない。Worker 境界は **`apps/worker/tests` の Vitest** と **`pnpm test:api`（Hurl）**。[ADR 0001](../../../docs/adr/0001-testing-and-harness-layers.md) と同趣旨を崩さない。
- **`pnpm harness` と `harness:ci`**: ローカル **`pnpm harness`** は速いゲート中心。**Next 本番相当の `next build`（web）** は **`pnpm harness:ci`** / CI `unit` に寄せる。管理画面を触った変更で CI だけ落ちるパターンを疑う。
- **ルートの厚さ**: `ROUTE_LINE_CAPS` は **CI 用の行数上限**であり「ルートは十分薄い」の根拠にはしない。キャップを上げる前に **`application/` へ抽出**（[steps-0-3-red-green-refactor.md](steps-0-3-red-green-refactor.md) Step 4〜5 と整合）。
- **攻撃面**: LIFF・受信 Webhook・公開フォーム・トラッキング・Stripe 等、**認可・署名・レート制限**に触れる変更は **`pentest`** 正本を見出しで素通りしない（必要なら [steps-pentest-tdd-loop.md](steps-pentest-tdd-loop.md) を 1 本目に）。
- **本番結線**: Cloudflare Access／CORS／別オリジン管理画面／D1 運用は **`AGENTS.md`** が長文の正本。ハーネスが緑でも **エッジや環境変数**で失敗し得る — SKILL に手順を複製しない。

---

## 5. 共通ルール（短く）

### 5.1 よく使う経路

- **UI・ブランドから**: `0 → 1 → 2 → 3`。**API だけ**: `2`（必要なら）→ `3`。
- **TDD**: `3→4→5→6` のあと **`7` で `pnpm harness` 緑** → 必要なら 8〜11。**リリース相当**: `11` または `check`。
- **pentest**: [steps-pentest-tdd-loop.md](steps-pentest-tdd-loop.md)。Red／Green／harness の Step 対応は同ファイル先頭の表。

### 5.2 デザイン完了の意味

- **0**: トークンを **ファイル＋CSS（＋必要なら LIFF）** まで反映。
- **1**: `hearing-summary.md` と **差分チェックリスト（ファイルパス付き）**。承認前に本番実装を書かない。

### 5.3 秘密・本番

- 秘密は wrangler / Vercel / `.dev.vars` のみ。チャットに貼らない。
- `WEB_URL` / `ALLOWED_ORIGINS` / `LIFF_URL` は実 origin と一致。
- **本番**: migrations・`LINE_ACCOUNT_SECRETS_WRITE_SECRET` 等は `AGENTS.md`。**マージゲートの赤**と **本番 env** を混同しない（前者は [steps-harness.md](steps-harness.md)「マージゲートが赤いとき」）。

### 5.4 TDD とカプセル化

- **Red なし Green 禁止**。
- Step 4〜5 のループの中で **`pnpm check:encapsulation`**（`ROUTE_LINE_CAPS` 忘れに注意）。**この時点で `class` / `interface` 禁止も一緒に確認される**。
- **P1〜P7** などコード検証済み論点は pentest 正本の表。**回帰は Vitest に残す**（`pnpm harness` が毎回実行）。

### 5.4.1 TypeScript 設計（構造的部分型の落とし穴）

- **クラスを使わない**（必要なら Error/SDK の薄い互換ラッパ程度）。基本は **関数 + 依存注入（引数）**でクラス由来の `this` 依存を避ける。
- **データ型には Readonly**: DTO は `readonly` / `Readonly<T>` を優先し、ミューテーションは境界（DB/write）に閉じ込める。
- **データ型と振る舞いを分離**: 型は「形」のドキュメント。振る舞い・検証・分岐は **関数** に寄せる（後述のとおり型は実行時に存在しない）。
- **Branded Type** で ID などの値オブジェクトを区別する。同じプリミティブでも brand が違えば代入ミスを型で止められる。
- **`pnpm check:encapsulation` の TS 設計ゲート**: `packages/shared` / `packages/sdk` / `packages/line-sdk` / `apps/web` / `apps/worker` の本体コードで **`class` と `interface` を禁止**する。毎回の harness で機械的に落とす。
- **Java/C# との違い（構造的部分型）**: TS は **名義型ではない**。例: `Post` と `User` が **同じ公開プロパティ**だけを持ち、**private がどちらにも無い**（または型検査上区別に効かない）なら、**型検査上は互換**として扱われ、意図した区別にならない。値の区別が要るときは **brand** や **判別 union（タグ）** など実行時にも残る形を使う。
- **型注釈はトランスパイルで消える**: `interface` や型エイリアスで与えた情報は **実行時に参照できない**。リフレクションや「型名で分岐」はできない前提で設計する。
- **そのほかの落とし穴**:
  - **`this`** は必ずしもクラスインスタンスを指さない（メソッド抽出・コールバック・`bind` 忘れで変わる）。クラスに寄せない設計が安全。
  - **`private`** は **型検査時のみ** の概念で、実行時の秘匿やランタイムでのフィールド隠蔽にはならない（トランスパイル後は普通のプロパティになり得る）。

### 5.5 テスト階層

- Playwright（`tests/e2e/`）＝ UI ＋ **モック API**。**「E2E が緑」＝ API が本番相当に正しい**ではない。
- Worker のルート契約・ミドルウェアは **`apps/worker/tests`**（Vitest）が主戦場。実 HTTP の浅い統合は **`pnpm test:api`**（Hurl）。ステージング相当の秘密・本番挙動は **別途**（ADR 0001 の境界）。

### 5.6 完了・その他

- 変更後は **`pnpm harness`**（大きい変更は `harness:full` や `check`）。
- **Modifius / 定期 CI**: 補助線。詳細は **[steps-harness.md の 4.1](steps-harness.md)** のみ（ここでは複製しない）。
- **Step 12**: 人間手順・証跡を残す。UI 微調整でも最終は harness；ルーティング変えたら e2e 検討。

---

## 6. エージェント向け: 実行順と品質（empirical prompt tuning 観点）

本節は **SKILL.md を読んだ実行者**が、参照ファイルを漁らずに着手できるようにする。**Task / 別セッションの subagent で実測評価**するときは、正本 **[shuusei / empirical-prompt-tuning](../shuusei/SKILL.md)** のワークフロー（シナリオ 2〜3、要件チェックリスト、`[critical]` 付き最低 1 項目、毎回新規実行者）に乗せる。スラッシュ **`/shuusei`** でも同ファイルを指す。

### 6.1 Iteration 0（静的・dispatch 不要）

- **frontmatter `description`**（入口の 1 行目・**Use when**）が、セクション 1 の **番号 0〜12**・**`check`**・**`pentest` / `orthopedics`**・リッチ枝（親 0 の下位）に対応するトリガーを **漏れなく列挙できているか**確認する。
- **長い手順は SKILL に書かない**（索引＋早見表＋本節）。詳細は常に `steps-*.md` 側。

### 6.2 最小 Read ルール（decision index）

**[critical] `pnpm harness` / CI が赤い**: メニュー番号に関係なく、先に [steps-harness.md の「マージゲートが赤いとき」](steps-harness.md) を Read する（pentest フェーズに入る前も同様）。

| ユーザーが選んだ入口 | 1 本目に Read する `steps-*` | 2 本目が典型なら |
|----------------------|------------------------------|------------------|
| **0**（ビジュアル） | [steps-design-0-1.md](steps-design-0-1.md)（Step 0） | リッチ枝 → [steps-rich-menu-wallball.md](steps-rich-menu-wallball.md) |
| **1**（要件・8 Round） | [steps-design-0-1.md](steps-design-0-1.md)（Step 1） | [steps-brand-1-5.md](steps-brand-1-5.md) |
| **orthopedics** | [steps-orthopedics-wallball.md](steps-orthopedics-wallball.md) | — |
| **pentest** | [steps-pentest-tdd-loop.md](steps-pentest-tdd-loop.md) | 上記 [critical] のとき [steps-harness.md](steps-harness.md) を先 |
| **2** | [steps-harness.md](steps-harness.md) | — |
| **3〜6** | [steps-0-3-red-green-refactor.md](steps-0-3-red-green-refactor.md) | — |
| **7〜11** / **check** | [steps-4-8-gates.md](steps-4-8-gates.md) | — |
| **12** | [steps-deploy.md](steps-deploy.md) | 運用は [AGENTS.md](../../../AGENTS.md) |

原則: **`steps-*.md` を glob / キーワードだけで列挙してから選ばない**。上表で 1 本目を決め、そのファイル内リンクを辿る（参照 descent を避ける）。

### 6.3 実測が無いときの明示

**新規 subagent を dispatch できない**環境では、実測に代えて **構造審査**（6.1 + 表の整合・リンク切れ）に留める。結果を「収束済み」と扱わず、可能なら別セッションで empirical 評価を依頼する旨をユーザーに伝える。

### 6.4 メトリクスの読み方（補助）

精度だけでは skill の問題が隠れる。シナリオ間で **ツール呼び出し数が他比 3〜5 倍以上**なら、decision index が足りず参照探索が起きているサイン。対処は **6.2 の表を SKILL 先頭付近に保つ**、または該当 `steps-*.md` 冒頭に「いつどのファイルを読むか」を 1 段落で足すこと。

---

## 7. 参照リンク

- [Harness Engineering（2026）](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/) — このリポとの対応は [steps-harness.md](steps-harness.md) 冒頭
- [ADR 0001](../../../docs/adr/0001-testing-and-harness-layers.md) / [ADR 0002](../../../docs/adr/0002-harness-engineering.md)
