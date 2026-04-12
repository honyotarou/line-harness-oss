/**
 * Policy bits for automation side-effects during {@link fireEvent} — kept separate for tests and single responsibility.
 */

/** When true, automation `send_webhook` is skipped (mitigates incoming-webhook → outbound → incoming loop DoS). */
export function shouldSuppressAutomationSendWebhook(params: {
  incomingWebhookTriggered: boolean;
  /** `ALLOW_AUTOMATION_SEND_WEBHOOK_FROM_INCOMING_WEBHOOK` — opt-in; unsafe for open partner webhooks. */
  allowSendWebhookFromIncomingEnv: boolean;
}): boolean {
  if (!params.incomingWebhookTriggered) {
    return false;
  }
  return !params.allowSendWebhookFromIncomingEnv;
}
