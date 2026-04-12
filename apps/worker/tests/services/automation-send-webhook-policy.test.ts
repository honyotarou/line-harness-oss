import { describe, expect, it } from 'vitest';
import {
  automationSendWebhookHostnameAllowed,
  parseAutomationSendWebhookHostAllowlist,
} from '../../src/services/automation-send-webhook-policy.js';

describe('automation-send-webhook-policy', () => {
  it('parseAutomationSendWebhookHostAllowlist returns empty for unset/blank', () => {
    expect(parseAutomationSendWebhookHostAllowlist(undefined)).toEqual([]);
    expect(parseAutomationSendWebhookHostAllowlist('')).toEqual([]);
    expect(parseAutomationSendWebhookHostAllowlist('  ,  ,')).toEqual([]);
  });

  it('parseAutomationSendWebhookHostAllowlist splits and lowercases', () => {
    expect(parseAutomationSendWebhookHostAllowlist('Hooks.Slack.COM, .Example.com ')).toEqual([
      'hooks.slack.com',
      '.example.com',
    ]);
  });

  it('automationSendWebhookHostnameAllowed is true when rules empty', () => {
    expect(automationSendWebhookHostnameAllowed('evil.com', [])).toBe(true);
  });

  it('automationSendWebhookHostnameAllowed matches exact host', () => {
    expect(automationSendWebhookHostnameAllowed('hooks.slack.com', ['hooks.slack.com'])).toBe(true);
    expect(automationSendWebhookHostnameAllowed('evil.com', ['hooks.slack.com'])).toBe(false);
  });

  it('automationSendWebhookHostnameAllowed matches suffix rule', () => {
    expect(automationSendWebhookHostnameAllowed('hooks.slack.com', ['.slack.com'])).toBe(true);
    expect(automationSendWebhookHostnameAllowed('slack.com', ['.slack.com'])).toBe(true);
    expect(automationSendWebhookHostnameAllowed('notslack.com', ['.slack.com'])).toBe(false);
  });
});
