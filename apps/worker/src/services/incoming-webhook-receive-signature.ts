import { verifySignedPayload } from './signed-payload.js';

/** Replay window for `POST /api/webhooks/incoming/:id/receive` (seconds). */
export const INCOMING_WEBHOOK_SIGNATURE_MAX_AGE_SEC = 300 as const;

export type VerifyIncomingWebhookSignedBodyOpts = Readonly<{
  /** Clock injection for tests; defaults to `Date.now()`. */
  nowMs?: number;
}>;

/**
 * Verifies HMAC for incoming partner webhooks. Timestamp is mandatory: the message
 * signed is `unixSeconds + "." + rawBody` (see `buildTimestampedSignedPayload`), sent
 * as header `X-Webhook-Timestamp`. Legacy body-only HMAC is never accepted.
 */
export function verifyIncomingWebhookSignedBody(
  secret: string,
  rawBody: string,
  providedSignature: string,
  timestampHeader: string | null | undefined,
  opts?: VerifyIncomingWebhookSignedBodyOpts,
): Promise<boolean> {
  const trimmed =
    typeof timestampHeader === 'string' && timestampHeader.trim() !== ''
      ? timestampHeader.trim()
      : undefined;
  return verifySignedPayload(secret, rawBody, providedSignature, {
    timestamp: trimmed,
    maxAgeSec: INCOMING_WEBHOOK_SIGNATURE_MAX_AGE_SEC,
    requireTimestamp: true,
    nowMs: opts?.nowMs,
  });
}
