# Empirical Prompt Tuning（`/shuusei`）

リポジトリの **`.cursor/skills/shuusei/SKILL.md` を全文 Read** し、Iteration 0 → ベースライン →（可能なら）subagent 実測の順に従うこと。

- **フォルダ名**は `shuusei`、SKILL frontmatter の **name** は `empirical-prompt-tuning`（両方同一ファイルを指す）。
- **実測**（バイアス排除の別実行者）は **Task / 別セッションの新規 subagent** が必要。単一チャットの自己再読では代替しない（同 SKILL「環境制約」）。
- **`line` skill を大改訂した直後**: [`.cursor/skills/line/SKILL.md`](../skills/line/SKILL.md) のセクション 6 と本ファイルをセットで使い、`line` の decision index を評価シナリオに含める。
