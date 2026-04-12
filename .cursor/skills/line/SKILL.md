---
name: line
description: >-
  LINE Harness OSS の統合ワークフロー（/line）。番号メニューでデザイン0・1→ハーネス2→TDD3〜7→ゲート8〜11→デプロイ12。
  Cloudflare Worker、LIFF、Next 管理画面、カプセル化、pnpm harness、TDD、ペネトレ（steps-pentest-tdd-loop）、デプロイ。
  Use when: /line, /tdd, LINE CRM, line-harness-oss, デザイン壁打ち, リッチメニュー, harness, pentest, ペネトレ.
---

# LINE Harness OSS（`/line`）

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
| [steps-harness.md](steps-harness.md) | Step **2**・ゲート一覧・**マージゲートが赤いとき**・E2E 層・Modifius §4.1 |
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
| `packages/db`, `packages/shared`, `docs/design/` | DB・共有・デザイントークン |

---

## 4. 実装前提（1 行ずつ）

| 領域 | メモ |
|------|------|
| Worker | 振る舞いは `application/`・`services/`。`routes/` は配線。 |
| マルチアカウント | `line_accounts`・スコープ・Webhook destination |
| LIFF | `/auth/*`、`POST /api/liff/*`、CSP |
| セキュリティ | 管理セッション、CF Access 任意、LIFF state／リダイレクト、Bot／ホスト |
| DB | `schema.sql` と `migrations/` を同じ変更単位。**本番 D1 の遅れ**は運用論点 → `AGENTS.md` |
| カプセル化 | `pnpm check:encapsulation`。新規 `routes/*.ts` は **`ROUTE_LINE_CAPS`** |
| **harness が赤い** | 分岐の正本 → [steps-harness.md](steps-harness.md) **「マージゲートが赤いとき」** |

---

## 5. 共通ルール（短く）

### 5.1 よく使う経路

- **UI・ブランドから**: `0 → 1 → 2 → 3`。**API だけ**: `2`（必要なら）→ `3`。
- **TDD**: `3→4→5→6` のあと **`7` で `pnpm harness` 緑** → 必要なら 8〜9。**リリース相当**: `11` または `check`。
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
- Step 4〜5 のループの中で **`pnpm check:encapsulation`**（`ROUTE_LINE_CAPS` 忘れに注意）。
- **P1〜P7** などコード検証済み論点は pentest 正本の表。**回帰は Vitest に残す**（`pnpm harness` が毎回実行）。

### 5.5 テスト階層

- Playwright ＝ UI ＋ **モック API**。本物の Worker HTTP は **`pnpm test:api`**。

### 5.6 完了・その他

- 変更後は **`pnpm harness`**（大きい変更は `harness:full` や `check`）。
- **Modifius / 定期 CI**: 補助線。詳細は **[steps-harness.md §4.1](steps-harness.md)** のみ（ここでは複製しない）。
- **Step 12**: 人間手順・証跡を残す。UI 微調整でも最終は harness；ルーティング変えたら e2e 検討。

---

## 6. 参照リンク

- [Harness Engineering（2026）](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/) — このリポとの対応は [steps-harness.md](steps-harness.md) 冒頭
- [ADR 0001](../../../docs/adr/0001-testing-and-harness-layers.md) / [ADR 0002](../../../docs/adr/0002-harness-engineering.md)
