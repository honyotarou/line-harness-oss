# LINE Harness OSS 統合ワークフロー（`/line`）

リポジトリの **`.cursor/skills/line/SKILL.md` を全文 Read** し、冒頭の番号メニューに従うこと。

- ユーザーが **番号・キーワード**（例: `2` harness、`pentest`、`orthopedics`、`0` ムードボード）を既に言っているなら、その枝を優先して実行する。
- メニューだけでは足りない詳細は、SKILL 内のリンク先 `steps-*.md` を都度 Read する。
- **TDD とカプセル化は同時進行**: Step **4〜5** の途中で **`pnpm check:encapsulation`** を回す（Step 7 や「全部終わってから」にしない）。PR の **CI は Biome の直後**にカプセル化が走る。
- **Step 7** では必ず **`pnpm harness`** で緑（Biome・カプセル化・型・LIFF build・全 unit）。ルート追加時は **`ROUTE_LINE_CAPS`** を忘れない。
- 狭い反復では `pnpm check:encapsulation` と該当 `vitest` だけでもよい。
