# Step 1O — 整形外科向け「壁打ち→反映」（/line orthopedics）

## 目的

整形外科/クリニックの壁打ちを **会話で終わらせず**、必ず **リポジトリへ反映**して完了にする。

## 壁打ちで確定させる差分（最小）

- **患者導線**: 初診/再診/リハビリ/検査/交通事故/労災の入口と分岐
- **予約**: オンライン予約の可否、不可時の **電話フォールバック**（表示タイミング/文言/ボタン）
- **通知**: **夜間プッシュ禁止**（Quiet hours の定義・例外・テスト）
- **問診**: 必須/任意、保存する/しない（機微は保存しない）
- **運用**: タグ/シナリオ/テンプレ/自動化（受付、前日、再来）

## 反映先（必須アウトプット）

- **設計サマリ（必須）**: `docs/design/hearing-summary.md`
  - 上記の差分を追記し、反映先ファイルまで列挙する
- **LIFF（必須）**: `apps/liff/src/`（問診フォーム/導線）
- 予約不能/障害時に **必ず電話 CTA**（tel:）を出す（「やり直し」だけは禁止）
- **Worker（必須）**: `apps/worker/src/routes/liff.ts` / `apps/worker/src/index.ts`
  - 予約不能時の電話フォールバック（`BOOKING_FALLBACK_TEL` / `tel:` 正規化）を必ず担保
- **Worker（必須）**: `apps/worker/src/services/*delivery*.ts`
  - **夜間プッシュ禁止**のガード（リマインダ/配信/ステップ配信のどこで止めるか）
- **DB（必要なら必須）**: `packages/db/schema.sql`
- **テスト（必須）**
  - Web: `pnpm --filter web test`
  - Worker: 触った箇所の Vitest（ルート/バリデーション/フォールバック）
  - LIFF: `pnpm --filter liff test`（電話 CTA の “必ず” を固定）

## 完了チェックリスト（このステップの完了条件）

- [ ] `docs/design/hearing-summary.md` に整形外科差分＋反映先が記載されている
- [ ] `apps/liff` に問診/導線が反映されている（or 反映しない理由が docs に明記）
- [ ] `apps/worker` に受け口/バリデーション/フォールバックが反映されている
- [ ] 夜間プッシュ禁止が実装され、該当テストが追加されている
- [ ] DB 変更があるなら `packages/db/schema.sql` とテストが更新されている
- [ ] `pnpm --filter web test` が通る

