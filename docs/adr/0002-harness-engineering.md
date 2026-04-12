# ADR 0002: Harness Engineering をリポジトリに落とす

## Status

Accepted

## Context

Coding Agent 前提の開発では、プロンプトより **決定論的ハーネス**（型・テスト・CI・フック）が出力の安定性を左右する。[Harness Engineering ベストプラクティス（逆瀬川ちゃん, 2026）](https://nyosegawa.com/posts/harness-engineering-best-practices-2026/) では、**§1 リポジトリ衛生**（実行可能物・ADR を正本に、腐敗しやすい長文仕様を置かない）、**§2 決定論とガードレール**（リンターを LLM にさせない、アーキテクチャを機械チェックに載せる、フィードバックは PostToolUse → pre-commit → CI の速い順）、**§3 AGENTS はポインタ**、**§4 計画と実行の分離**、**§5 E2E の層分け**、**§7 ハーネスがモデルより重要**、**MVH** と **アンチパターン**（プロンプトだけに頼らない等）が繰り返し示されている。

## Decision

1. **速いゲート（秒〜十数秒）**: `pnpm harness` = **Biome format 検証** + Worker `tsc` + 全パッケージユニットテスト。Lefthook pre-commit とエージェントのデフォルト完了条件とする。
2. **CI 同等（カバレッジ）**: `pnpm harness:ci` で worker/web の `test:coverage` + SDK テスト（GitHub Actions `unit` ジョブに揃える）。
3. **広い完了ゲート（分単位）**: `pnpm harness:full` = `harness` + Playwright + Hurl API 統合。PR 直前・大きめ変更・Stop フックの想定。
4. **Claude Code（任意）**: `.claude/settings.json` で `PreToolUse` に **設定・CI・ハーネス正本の編集ブロック**（`pre-protect-config.sh`、exit 2）、`PostToolUse` に **Biome 単ファイル format** → **pnpm harness**、`Stop` に harness を差し込む。失敗時は `hookSpecificOutput.additionalContext` でログを返す（記事の Safety / Quality / Completion パターン）。
5. **Biome**: まずは **formatter のみ**（`linter.enabled: false`）。`pnpm format` / `pnpm format:check`。`pnpm harness` と CI `unit` の先頭で `biome format .` を実行。
6. **真実のソース**は引き続きテストと ADR（0001 と整合）。長い設計メモは増やさない。
7. **PR CI（`unit`）での早期アーキテクチャゲート**: `.github/workflows/ci.yml` で **`pnpm format:check` の直後**に **`pnpm check:encapsulation`** を実行する（記事 §2「アーキテクチャをガードレールに」、§1「テスト・機械判定可能なルールを正本に」に沿い、ビルド前にレイヤー違反を検出する）。Worker の `encapsulation-gate.test.ts` でも同スクリプトを実行し二重化する。

**PreToolUse 保護パス（人間の PR でのみ変更）**: `lefthook.yml`、`biome.json`、ルート / `packages/tsconfig.base.json`、`playwright.config.ts`、`.github/workflows/*`、`scripts/harness-check.sh` / `harness-ci-parity.sh` / `harness-full.sh` / `api-integration.sh`、`.claude/settings.json`、上記 three Claude hook スクリプト。

## Consequences

- ローカルで CI に近い検証が一段階で可能になる。
- Claude 利用者は Hooks を有効にすると編集ごとに harness が走る（遅さが気になる場合は `settings.local.json` で無効化または matcher 調整）。
- `harness:full` は Hurl・Playwright 依存のため、初回は `playwright install` と hurl のインストールが必要。
