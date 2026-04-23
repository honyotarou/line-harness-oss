# GAS アプリ開発ワークフロー（`/gas`）

**`.cursor/skills/gas/SKILL.md` を全文 Read** し、冒頭の番号メニューに従うこと。

- **最初に Read する `steps-*` は SKILL の「番号 → 最初に Read する steps-*（decision index）」表で 1 本決める**（glob 列挙で選ばない）。
- **本 SKILL を大きく直した直後**は [`.cursor/skills/shuusei/SKILL.md`](../skills/shuusei/SKILL.md)（**`/shuusei`**）で empirical 評価（別 subagent・シナリオに decision index を含める）を推奨。
- ユーザーが **番号・キーワード**（例: `0` デザイン、`4` failing tests、`5` 実装、`check` 品質ゲート）を既に言っているなら、その枝を優先して実行する。
- 新しい検証・サニタイズ・ロック等を書く前に、SKILL の **Canonical helpers** 表を確認（`sanitize` / `validation.js` / `withSpreadsheetLock` / `buildCsv` / `sync-domain-snippets-to-index.mjs` / `scripts/gas-entry.js` 等）。書き下ろしはドリフトの元。
- `check` 実行時は **誤報防止（`[critical]`）の 3 点**を必ず満たす: `file:line` 提示、コード引用、近接する保護（`sanitize` / `validation.js` / AUTO マーカー / 既存 test）の不存在確認。満たせないなら報告しない。
- TDD サイクルの途中で Step を飛ばしそうになったら、[steps-4-6.md](../skills/gas/steps-4-6.md) 末尾の「よくある失敗」表を見て **戻るべき Step** を確認。
