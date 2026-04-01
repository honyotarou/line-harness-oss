# ADR 0003: LIFF booking phone fallback endpoint

- Status: Accepted
- Date: 2026-04-01

## Context

LIFF でオンライン予約を完結できない場合（設定未整備・枠なし・エラー等）に、**電話番号へ誘導**する共通 API が必要。`/api/liff/profile` と同様、**LINE Login ID トークン**で本人性を確認してから案内文と `tel:` を返す。

## Decision

1. **`POST /api/liff/booking/phone-fallback`** — Body: `lineUserId`, `idToken`。検証は `verifyLineLoginIdToken` と `getFriendByLineUserId` を **`/api/liff/profile` と同型**に再利用する（`sub` と `lineUserId` の一致、既存友だちのみ）。
2. **`BOOKING_FALLBACK_TEL`**（Worker バインディング、任意）— `tel:...` またはダイアル可能な文字列。未設定時は **503**（`Booking phone fallback is not configured`）。番号はチャットに載せる想定のため秘匿情報ではないが、**チャネルごとに env で差し替え**できるようにする。
3. **HTTP 順序** — 不正 body は **400**、番号未設定は **503**（LINE verify を呼ばない）、トークン／友だちは **401** / **404**。OpenAPI の主対象は引き続き管理系 Bearer API；LIFF 公開エンドポイントは Vitest で契約固定する。

## Consequences

- 新規 D1 テーブルは不要。
- 管理画面 `authMiddleware` の対象外のまま（LIFF 系は ID トークン境界）。
- 運用: 本番では `BOOKING_FALLBACK_TEL` を設定するか、未設定のまま 503 で「未構成」を検知できる。
