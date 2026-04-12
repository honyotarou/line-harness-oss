import { describe, expect, it } from 'vitest';
import { shouldSuppressAutomationSendWebhook } from '../../src/services/fire-event-automation-policy.js';

describe('shouldSuppressAutomationSendWebhook', () => {
  it('is false when not triggered from incoming webhook', () => {
    expect(
      shouldSuppressAutomationSendWebhook({
        incomingWebhookTriggered: false,
        allowSendWebhookFromIncomingEnv: false,
      }),
    ).toBe(false);
    expect(
      shouldSuppressAutomationSendWebhook({
        incomingWebhookTriggered: false,
        allowSendWebhookFromIncomingEnv: true,
      }),
    ).toBe(false);
  });

  it('is true for incoming webhook chain unless env override is on', () => {
    expect(
      shouldSuppressAutomationSendWebhook({
        incomingWebhookTriggered: true,
        allowSendWebhookFromIncomingEnv: false,
      }),
    ).toBe(true);
    expect(
      shouldSuppressAutomationSendWebhook({
        incomingWebhookTriggered: true,
        allowSendWebhookFromIncomingEnv: true,
      }),
    ).toBe(false);
  });
});
