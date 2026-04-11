# LINE Harness OSS 統合ワークフロー（`/line`）

リポジトリの **`.cursor/skills/line/SKILL.md` を全文 Read** し、冒頭の番号メニューに従うこと。

- ユーザーが **番号・キーワード**（例: `2` harness、`pentest`、`orthopedics`、`0` ムードボード）を既に言っているなら、その枝を優先して実行する。
- メニューだけでは足りない詳細は、SKILL 内のリンク先 `steps-*.md` を都度 Read する。
- コード変更後の完了条件は通常 **`pnpm harness`**（SKILL / steps-harness に準拠）。
