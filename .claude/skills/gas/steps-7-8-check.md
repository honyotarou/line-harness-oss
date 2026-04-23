# Steps 7〜8 + 品質ゲート

## 7: 最終チェック

**前提**: Step 6 で全テストが green

### テスト（1-3）
1. `npx vitest run --coverage`
2. `npx playwright test`
3. `npm run build:gas` 正常完了

### セキュリティ（4-6）
4. innerHTML に未サニタイズデータがないか
5. textContent / DOM API を使っているか
6. CSV 数式インジェクション防止

### ビルド健全性（7-10）
7. node --check gas/Code.gs 通過
8. import/export が0件
9. const/function の重複なし
10. 関数名が仕様と完全一致

### 関数名一貫性（11-13）
11. index.html の google.script.run ↔ Code.gs 一致
12. src/application/ エクスポート ↔ Code.gs 一致
13. エラーコード/メッセージが src/ ↔ index.html で一致（**日本語統一**の場合は validation.js 正本と index の `validate()` 文言を突き合わせ）
13b. `google.script.run` の **失敗ハンドラ**で GAS の **`throw "文字列"`** がそのままユーザー向けメッセージになる（string を `Error` に包む等）

### 正本一貫性（14-15）
14. index.html バリデーション ↔ domain/validation.js 一致
15. 乖離がある場合、正本への参照コメントあり
15b. 単一 HTML で domain 注入している場合、`AUTO_*` マーカーが存在し `npm run build:gas` 後も壊れていないこと

### GAS 本番接続（16-20）
16. MOCK_MODE=false パスが全サーバー関数を呼ぶ
17. 読み取り系画面が必要な全関数を呼ぶ構造
18. 外部API連携がサーバー側でサイズ・形式検証
19. 書き込み系関数がサーバー側で整合性チェック + バリデーション
20. API キー等が PropertiesService 経由 + ヘッダー送信

### デザイン（21-23）
21. ハードコード色なし（CSS変数経由）
22. design-tokens.json との照合
23. 禁止事項に違反なし

### 構造（24-26）
24. domain/ → infrastructure/ 依存なし
25. application/ が薄い
26. ghost file / console.log / 未使用エクスポートなし

### lint（27-28）
27. `npx biome check src/` エラーゼロ
28. `npx biome check tests/` エラーゼロ

### 仕様（29-31）
29. specs/ 受け入れ条件に全テスト対応
30. E2E テストが0件ではない
31. integration テストが0件ではない

### カバレッジ（32）
32. coverage.include が domain/ + application/ のみ

### フロントエンド状態管理（33-36）
33. showToast が clearTimeout で前タイマーキャンセル
34. failureHandler で editingRecordId をクリアしていないこと
35. 非同期操作中に保存ボタンが disabled
36. 外部 API 結果が null/部分欠損時にユーザーへ警告表示

### 品質ゲート（37 + 追補）
37. **品質ゲート（check）を実行**し全 OK であること（本書の 9-1〜9-12・テスト網羅 9-9 を含む。プロジェクトにより 9-11/9-12 は N/A 可）

---

## 8: デプロイ

**前提**: Step 7 完了 + 品質ゲート全 OK

### 8a. clasp 環境確認
1. `npx clasp --version` → なければ `npm install -g @google/clasp`
2. `npx clasp login --status` → 未ログインなら案内
3. `.clasp.json` 確認 → なければ新規作成 or Script ID 入力

### 8b. appsscript.json 確認
```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_WITH_LINK"
  }
}
```

### 8c. push 対象ファイル (.claspignore)
```
**/*
!gas/Code.gs
!index.html
!appsscript.json
```

### 8d. push
1. `npm run build:gas`
2. `npx clasp push`

### 8e. deploy
1. `npx clasp deploy -d "v<N> - <変更概要>"`
2. `npx clasp deployments` で URL 取得

### 8f. 動作確認案内
```
Web アプリ URL をブラウザで開いて動作確認してください:
<URL>
確認ポイント: 画面表示・データ保存・Spreadsheet 書き込み
```

---

## check: 品質ゲート（任意タイミング）

修正ブランチで発見された頻出バグ8パターンを grep ベースで検証。

### 誤報防止（`[critical]` 毎ラウンド必須）

grep がヒットしたからといって即 finding として報告しない。**過去のエージェントは近接する保護を見落として誤報を量産した実績がある**。**finding 1 件につき次の 3 つを必ず満たす**:

1. **file:line を提示** — `path/to/file.js:LINE` を具体的に書く。「〜に違いない」「どこかに」は禁止
2. **該当コードを引用** — 主張する問題がそのコードから実際に起きることを数行のコピペで示す
3. **近接する保護の不存在を確認** — grep ヒットの周辺 20〜50 行を Read し、次のいずれかで既に守られていないかを突合する:
   - `sanitize()` / `src/domain/validation.js` / `withSpreadsheetLock` / `﻿` BOM / `AUTO_*` マーカー
   - 書き込み系 integration テスト（`tests/integration/*.test.js`）
   - 品質ゲート 9-2 / 9-3 / 9-9 の既存テスト

**3 点を満たせない場合は finding として報告しない**（深掘りして確証を取るか、黙って次のパターンへ）。報告しない選択は失敗ではなく正解。出典: `shuusei/SKILL.md`。

### Red flags（合理化に注意）

`check` 実行中に agent が出しがちな合理化とその実態。出たら一度手を止めて検証する。

| 出てくる合理化 | 実態 |
|---------------|------|
| 「grep でヒットしたから violation」 | 保護ヘルパ（sanitize / validation / AUTO マーカー）で既に守られていることが多い。**誤報防止 3 点**を満たすまで finding にしない |
| 「`innerHTML` が 1 件残っているが意図的なコメント内」 | それでも `grep -n 'innerHTML'` が 0 件でなければ 9-1 は違反。**コメントも消す**か、対象 grep を調整する PR を別途出す（ゲート緩和ではなく「実態と齟齬がない」を優先） |
| 「`JSON.parse` が多いからテストも後回し」 | 9-3 は **全件 try-catch + degraded return** が契約。後回し時点で本番で壊れる未来確定 |
| 「`:root` 定義を増やせば 9-8 は通る」 | 先に `design-tokens.json` にトークンを追加し、**`var()` で参照**する。`:root` 直書きは token 正本を壊す |
| 「英語バリデーションメッセージが残っているが影響小」 | 9-12 は 0 件が契約。**`validation-messages.test.js` が同時に守っているか**を確認。残す場合はテスト側も更新 |
| 「`MOCK_MODE=true` 既定だが自分は開発者だから問題なし」 | 9-10 は **本番 URL のユーザーが mock に当たらない**ことを検証している。既定は `false` |
| 「`--no-verify` で commit して CI で直す」 | **禁止**。pre-commit / pre-push は grep 系品質ゲートの最終砦。セキュリティ不変を削る修正は受け付けない |
| 「自分で再読すれば誤報か判定できる」 | 直前に書いた仮説を自分で客観視はできない（shuusei の基本則）。**別セッションか Task dispatch で再検証**、それも不能なら「empirical 不能」と明示する |
| 「Red flag 1 件ごとに PR を分けよう」 | 意味単位で 1 PR。関連する 2〜3 件の微修正は 1 コミットに束ねて良い（分けすぎは iter 数爆発） |



### 9-1. innerHTML 完全排除
```bash
grep -n 'innerHTML' index.html
```
0件であること。

### 9-2. sanitize 網羅性
```bash
grep -rn 'import.*sanitize' src/application/
```
全書き込み系関数で import + 文字列フィールドに sanitize() 適用。

### 9-3. JSON.parse 保護
```bash
grep -rn 'JSON\.parse' src/
```
- `JSON.parse` が 0件でも OK。
- 1件以上ある場合は全て try-catch 囲み。
- catch では degraded return（全null + warnings）または明示エラー方針を統一する。

### 9-4. クランプ警告
医療データのサイレントクランプは禁止。

### 9-5. GAS バンドルがテストを取り込まない
`scripts/gas-entry.js` は `src/application/app.js` のみをエントリとする。**tests/** を import しない（esbuild が取り込むのは到達グラフのみ）。任意確認: `grep -n tests scripts/gas-entry.js` が空。

### 9-6. setValue バッチ化
```bash
grep -n 'setValue(' src/infrastructure/
```
連続 setValue 3回以上なし。

### 9-7. CSV BOM
```bash
grep -n 'uFEFF\|BOM' src/domain/csv.js
```
buildCsv 先頭に `\uFEFF` があること。

### 9-8. CSS ハードコード値
```bash
grep -nE 'rgba?\(|#[0-9a-fA-F]{3,8}' index.html | grep -v -- '--.*:' | grep -v '^\s*//'
```
`:root` 定義以外で rgba/hex があれば違反。design-tokens.json にトークン追加 + var() 置換。
**頻出: `:focus` の box-shadow、warning トースト色**

### 9-10. 本番分岐・入力配線チェック（必須）
```bash
grep -n 'MOCK_MODE' index.html
grep -n 'runOcrBatch' index.html
grep -n '#files\\|getElementById(\"files\")' index.html
grep -n 'toISOString().slice(0, 10)' index.html
```
- `MOCK_MODE` 既定が本番パスであること（`?mock=true` の時のみ mock）
- OCR 実行時に `#files` を読み取り、サーバー関数に payload を渡していること
- 日付初期化で UTC ずれを起こす `toISOString().slice(0,10)` を常用しないこと

### 9-11. domain スニペットマーカー（単一 HTML + 同期スクリプト利用時）
```bash
grep -c 'AUTO_EXTRACT_SCORES_CORE_START' index.html
grep -c 'AUTO_SPREADSHEET_SANITIZE_START' index.html
```
各 1 以上であること（プロジェクトが `sync-domain-snippets-to-index.mjs` を使う場合）。

### 9-12. バリデーション英語メッセージの残存チェック（医療 UI 方針）
```bash
grep -nE 'must be |is invalid|patientId mismatch|Active spreadsheet' src/domain/validation.js src/application/app.js src/infrastructure/adapters.js
```
0 件であること（日本語方針のとき）。該当ファイルが無いプロジェクトはスキップ可。

### 9-9. テスト網羅の機械検証（必須）
```bash
grep -rn 'innerHTML' tests/
grep -rn 'sanitize' tests/
grep -rn 'JSON.parse\|パース' tests/
grep -rn 'clamp\|warnings\|範囲外' tests/
grep -rn 'uFEFF\|BOM' tests/
grep -rn 'rgba(\|#[0-9a-fA-F]\|ハードコード\|token' tests/
```
- 上記の各観点で最低1件ヒットすること。
- 欠けがあれば `テスト不足` 判定にする。

### 出力形式
```
GAS 品質ゲート:
━━━━━━━━━━━━━━━━━━━━━━━━━━
9-1 innerHTML       ✅ 0件
9-2 sanitize        ✅ 全関数適用済み
9-3 JSON.parse      ✅ try-catch あり
9-4 クランプ警告     ✅ 警告表示あり
9-5 ビルド除外       ✅ test/spec 除外あり
9-6 setValue 一括    ✅ バッチ化済み
9-7 CSV BOM         ✅ \uFEFF あり
9-8 CSS ハードコード  ✅ 全て CSS 変数経由
9-10 本番分岐/OCR配線 ✅
9-11 AUTO マーカー    ✅（該当時） / N/A
9-12 英語バリデ残存   ✅ 0件（該当時） / N/A
テスト網羅 (9-9)    ✅ 全パターンにテストあり
━━━━━━━━━━━━━━━━━━━━━━━━━━
合計: OK / 要修正 / テスト不足（プロジェクトに応じて項目数可変）
```

違反があれば修正コードも提示し、ユーザー承認後に適用。

### finding 報告フォーマット（違反があったとき）

違反 1 件につき次の形で残す（チャット + 必要なら `docs/adr/` に 1 行）。shuusei の「提示フォーマット」準拠。

```
## Finding <ID> — 9-<N> <短い名前>

- 主張: <誤報防止 3 点を満たした後の結論 1 行>
- 場所: path/to/file.js:LINE（複数可）
- 引用:
  <該当コード 2〜5 行をコピペ>
- 近接保護の確認: <Read 済みの周辺 — 「見つからなかった」or「これらでは守られていない理由」>
- 影響: <どのユーザー操作で顕在化するか>
- 修正案: <最小差分のコードスケッチ + 関連する `tests/unit/*.test.js` 追加>
- 優先度: P0 / P1 / P2 / P3
```

**ギャップが無かったラウンド**は主張を空にし、`近接保護の確認` に「○○ で守られていた（file:line）」と file:line つきで記録（次セッションで同じ grep が再ヒットしたときに誤報と即断できる）。

---

## observe（任意）: 定期観測CI（スケジュール運用）

`check` は **“壊しやすい地雷の機械検出”**、`observe` は **“定点観測（継続的に劣化を見つける）”**。
PR/Push のゲート（CI）とは別枠で、**週次/月次**などで回す。

### 目的

- flaky / 外部依存 / 環境差の影響を受けやすい領域（E2E、ビルド、サイズ上限、OCR 等）を **定期的に可視化**する
- “その時たまたま通った” を避け、**比較可能な条件**で履歴を残す

### 原則（/line の observe から移植）

- **ゲートと観測を混ぜない**: マージ可否は CI（lint/test/build）で決め、observe は補助線にする
- **安定性優先**: max-parallel を小さく、失敗時は 1 回だけリトライ（落ちないことが最重要）
- **出力を残す**: coverage / playwright-report / build 成果物などを artifact 化し、後で見返せるようにする

### 導入手順（コピペ運用）

1. リポジトリに `.github/workflows/observe.yml` を追加
2. まず `workflow_dispatch`（手動）で回す → 安定したら `schedule` を有効化
3. 失敗が増える場合は **max-parallel を下げる** or 対象を絞る

テンプレは `~/.cursor/skills/gas/templates/observe.yml` を参照（プロジェクト側へコピー）。
