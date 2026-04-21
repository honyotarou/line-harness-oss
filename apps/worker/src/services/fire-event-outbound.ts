import type { Env } from '../index.js';
import { effectiveRequireAutomationSendWebhookHostAllowlist } from './deployed-security-defaults.js';
import { fireEvent, type EventPayload } from './event-bus.js';
import { shouldSuppressAutomationSendWebhook } from './fire-event-automation-policy.js';

/** Partial: callers may pass `bindings ?? {}` from optional Worker env slices. */
export type AutomationWebhookBindings = Partial<
  Pick<
    Env['Bindings'],
    | 'AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS'
    | 'REQUIRE_AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS'
    | 'ALLOW_AUTOMATION_SEND_WEBHOOK_FROM_INCOMING_WEBHOOK'
    | 'WORKER_URL'
    | 'RELAX_DEPLOYED_SECURITY_DEFAULTS'
    | 'RELAX_DEPLOYED_SECURITY_CONFIRM'
    | 'ALLOW_AUTOMATION_SEND_WEBHOOK_WITHOUT_HOST_ALLOWLIST'
  >
>;

/** Optional caller context (e.g. incoming webhook handler). */
export type FireEventOutboundContext = Readonly<{
  incomingWebhookTriggered?: boolean;
}>;

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Forwards to {@link fireEvent} and applies automation `send_webhook` host policy from bindings. */
export async function fireEventRespectingAutomationWebhookHosts(
  db: D1Database,
  eventType: string,
  payload: EventPayload,
  bindings: AutomationWebhookBindings,
  lineAccessToken?: string,
  lineAccountId?: string | null,
  context?: FireEventOutboundContext,
): Promise<void> {
  const suppressAutomationSendWebhook = shouldSuppressAutomationSendWebhook({
    incomingWebhookTriggered: context?.incomingWebhookTriggered === true,
    allowSendWebhookFromIncomingEnv: isTruthyEnvFlag(
      bindings.ALLOW_AUTOMATION_SEND_WEBHOOK_FROM_INCOMING_WEBHOOK,
    ),
  });
  const requireHosts = effectiveRequireAutomationSendWebhookHostAllowlist(bindings);
  const hostsRaw = bindings.AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS;
  if (hostsRaw?.trim() || requireHosts || suppressAutomationSendWebhook) {
    await fireEvent(db, eventType, payload, lineAccessToken, lineAccountId, {
      automationSendWebhookAllowedHosts: hostsRaw,
      requireAutomationSendWebhookHostAllowlist: requireHosts,
      suppressAutomationSendWebhook,
    });
    return;
  }
  await fireEvent(db, eventType, payload, lineAccessToken, lineAccountId);
}
