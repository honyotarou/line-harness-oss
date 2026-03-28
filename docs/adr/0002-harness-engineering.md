# ADR 0002: Harness Engineering をリポジトリに落とす

## Status

Accepted

## Context

Coding Agent 前提の開発では、プロンプトより **決定論的ハーネス**（型・テスト・CI・フック）が出力の安定性を左右する。[Harness Engineering ベストプラクティス（逆瀬川ちゃん, 2026）](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/) では、特に **ハーネスがモデルより重要**、リンターの仕事を LLM にさせない、**フィードバックは速い層へ**、E2E の層分け、AGENTS をポインタに保つ、が繰り返し示されている。

## Decision

1. **速いゲート（秒〜十数秒）**: `pnpm harness` = **Biome format 検証** + Worker `tsc` + 全パッケージユニットテスト。Lefthook pre-commit とエージェントのデフォルト完了条件とする。
2. **CI 同等（カバレッジ）**: `pnpm harness:ci` で worker/web の `test:coverage` + SDK テスト（GitHub Actions `unit` ジョブに揃える）。
3. **広い完了ゲート（分単位）**: `pnpm harness:full` = `harness` + Playwright + Hurl API 統合。PR 直前・大きめ変更・Stop フックの想定。
4. **Claude Code（任意）**: `.claude/settings.json` で `PreToolUse` に **設定・CI・ハーネス正本の編集ブロック**（`pre-protect-config.sh`、exit 2）、`PostToolUse` に **Biome 単ファイル format** → **pnpm harness**、`Stop` に harness を差し込む。失敗時は `hookSpecificOutput.additionalContext` でログを返す（記事の Safety / Quality / Completion パターン）。
5. **Biome**: まずは **formatter のみ**（`linter.enabled: false`）。`pnpm format` / `pnpm format:check`。`pnpm harness` と CI `unit` の先頭で `biome format .` を実行。
6. **真実のソース**は引き続きテストと ADR（0001 と整合）。長い設計メモは増やさない。

**PreToolUse 保護パス（人間の PR でのみ変更）**: `lefthook.yml`、`biome.json`、ルート / `packages/tsconfig.base.json`、`playwright.config.ts`、`.github/workflows/*`、`scripts/harness-check.sh` / `harness-ci-parity.sh` / `harness-full.sh` / `api-integration.sh`、`.claude/settings.json`、上記 three Claude hook スクリプト。

## Consequences

- ローカルで CI に近い検証が一段階で可能になる。
- Claude 利用者は Hooks を有効にすると編集ごとに harness が走る（遅さが気になる場合は `settings.local.json` で無効化または matcher 調整）。
- `harness:full` は Hurl・Playwright 依存のため、初回は `playwright install` と hurl のインストールが必要。
