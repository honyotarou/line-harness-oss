import { describe, expect, it } from 'vitest';
import {
  effectiveMultiLineAccountQueryRequiresLineAccountId,
  effectiveRequireAutomationSendWebhookHostAllowlist,
  effectiveRequireCalendarTokenEncryption,
  effectiveRequireDedicatedAdminSessionSecret,
  effectiveRequireLiffStateSecret,
  effectiveRequireTrackingLinkDedicatedSecret,
  isIncompleteGlobalRelaxOnHttps,
  isRelaxedDeployedSecurityDefaults,
  isStrictDeployedHttpsSurface,
  RELAX_SECURITY_CONFIRM_PHRASE,
} from '../../src/services/deployed-security-defaults.js';

const httpsWorker = { WORKER_URL: 'https://api.example.com' };
const localWorker = { WORKER_URL: 'http://127.0.0.1:8787' };
const httpsRelaxPair = {
  ...httpsWorker,
  RELAX_DEPLOYED_SECURITY_DEFAULTS: '1',
  RELAX_DEPLOYED_SECURITY_CONFIRM: RELAX_SECURITY_CONFIRM_PHRASE,
};

describe('deployed-security-defaults', () => {
  describe('isRelaxedDeployedSecurityDefaults', () => {
    it('is true for RELAX without WORKER_URL (local / unset host)', () => {
      expect(isRelaxedDeployedSecurityDefaults({ RELAX_DEPLOYED_SECURITY_DEFAULTS: '1' })).toBe(
        true,
      );
      expect(isRelaxedDeployedSecurityDefaults({ RELAX_DEPLOYED_SECURITY_DEFAULTS: 'true' })).toBe(
        true,
      );
      expect(isRelaxedDeployedSecurityDefaults({})).toBe(false);
    });

    it('is false on HTTPS when only RELAX_DEFAULT is set (requires confirm phrase)', () => {
      expect(
        isRelaxedDeployedSecurityDefaults({
          ...httpsWorker,
          RELAX_DEPLOYED_SECURITY_DEFAULTS: '1',
        }),
      ).toBe(false);
    });

    it('is true on HTTPS when RELAX and confirm phrase match', () => {
      expect(isRelaxedDeployedSecurityDefaults(httpsRelaxPair)).toBe(true);
    });
  });

  describe('isIncompleteGlobalRelaxOnHttps', () => {
    it('is true when RELAX is set on HTTPS without correct confirm', () => {
      expect(
        isIncompleteGlobalRelaxOnHttps({
          ...httpsWorker,
          RELAX_DEPLOYED_SECURITY_DEFAULTS: '1',
        }),
      ).toBe(true);
      expect(isIncompleteGlobalRelaxOnHttps(httpsRelaxPair)).toBe(false);
      expect(isIncompleteGlobalRelaxOnHttps(localWorker)).toBe(false);
    });
  });

  describe('isStrictDeployedHttpsSurface', () => {
    it('is strict on HTTPS when RELAX is incomplete or absent', () => {
      expect(isStrictDeployedHttpsSurface(httpsWorker)).toBe(true);
      expect(
        isStrictDeployedHttpsSurface({
          ...httpsWorker,
          RELAX_DEPLOYED_SECURITY_DEFAULTS: '1',
        }),
      ).toBe(true);
      expect(isStrictDeployedHttpsSurface(httpsRelaxPair)).toBe(false);
      expect(isStrictDeployedHttpsSurface(localWorker)).toBe(false);
    });
  });

  describe('effectiveRequireAutomationSendWebhookHostAllowlist', () => {
    it('is false when ALLOW_WITHOUT is set', () => {
      expect(
        effectiveRequireAutomationSendWebhookHostAllowlist({
          ...httpsWorker,
          ALLOW_AUTOMATION_SEND_WEBHOOK_WITHOUT_HOST_ALLOWLIST: '1',
        }),
      ).toBe(false);
    });

    it('is true when REQUIRE flag is set even on local', () => {
      expect(
        effectiveRequireAutomationSendWebhookHostAllowlist({
          ...localWorker,
          REQUIRE_AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS: '1',
        }),
      ).toBe(true);
    });

    it('is false on local by default', () => {
      expect(effectiveRequireAutomationSendWebhookHostAllowlist(localWorker)).toBe(false);
    });

    it('is true on HTTPS by default', () => {
      expect(effectiveRequireAutomationSendWebhookHostAllowlist(httpsWorker)).toBe(true);
    });

    it('is false on HTTPS when full RELAX pair is set', () => {
      expect(effectiveRequireAutomationSendWebhookHostAllowlist(httpsRelaxPair)).toBe(false);
    });

    it('is true when REQUIRE overrides ALLOW_WITHOUT', () => {
      expect(
        effectiveRequireAutomationSendWebhookHostAllowlist({
          ...httpsWorker,
          REQUIRE_AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS: '1',
          ALLOW_AUTOMATION_SEND_WEBHOOK_WITHOUT_HOST_ALLOWLIST: '1',
        }),
      ).toBe(true);
    });
  });

  describe('effectiveMultiLineAccountQueryRequiresLineAccountId', () => {
    it('is false when ALLOW_WITHOUT is set', () => {
      expect(
        effectiveMultiLineAccountQueryRequiresLineAccountId({
          ...httpsWorker,
          ALLOW_MULTI_LINE_ACCOUNT_QUERY_WITHOUT_LINE_ACCOUNT_ID: '1',
        }),
      ).toBe(false);
    });

    it('is true when MULTI_LINE flag is set on local', () => {
      expect(
        effectiveMultiLineAccountQueryRequiresLineAccountId({
          ...localWorker,
          MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID: '1',
        }),
      ).toBe(true);
    });

    it('is false on local by default', () => {
      expect(effectiveMultiLineAccountQueryRequiresLineAccountId(localWorker)).toBe(false);
    });

    it('is true on HTTPS by default', () => {
      expect(effectiveMultiLineAccountQueryRequiresLineAccountId(httpsWorker)).toBe(true);
    });

    it('is false on HTTPS when full RELAX pair is set', () => {
      expect(effectiveMultiLineAccountQueryRequiresLineAccountId(httpsRelaxPair)).toBe(false);
    });

    it('is true when MULTI_LINE flag overrides ALLOW_WITHOUT', () => {
      expect(
        effectiveMultiLineAccountQueryRequiresLineAccountId({
          ...httpsWorker,
          MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID: '1',
          ALLOW_MULTI_LINE_ACCOUNT_QUERY_WITHOUT_LINE_ACCOUNT_ID: '1',
        }),
      ).toBe(true);
    });
  });

  describe('effectiveRequireCalendarTokenEncryption', () => {
    it('is false when ALLOW_PLAINTEXT is set', () => {
      expect(
        effectiveRequireCalendarTokenEncryption({
          ...httpsWorker,
          ALLOW_CALENDAR_SECRETS_PLAINTEXT_AT_REST: '1',
        }),
      ).toBe(false);
    });

    it('is true when REQUIRE flag is set on local', () => {
      expect(
        effectiveRequireCalendarTokenEncryption({
          ...localWorker,
          REQUIRE_CALENDAR_TOKEN_ENCRYPTION: '1',
        }),
      ).toBe(true);
    });

    it('is false on local by default', () => {
      expect(effectiveRequireCalendarTokenEncryption(localWorker)).toBe(false);
    });

    it('is true on HTTPS by default', () => {
      expect(effectiveRequireCalendarTokenEncryption(httpsWorker)).toBe(true);
    });

    it('is false on HTTPS when full RELAX pair is set', () => {
      expect(effectiveRequireCalendarTokenEncryption(httpsRelaxPair)).toBe(false);
    });

    it('is true when REQUIRE overrides ALLOW_PLAINTEXT', () => {
      expect(
        effectiveRequireCalendarTokenEncryption({
          ...httpsWorker,
          REQUIRE_CALENDAR_TOKEN_ENCRYPTION: '1',
          ALLOW_CALENDAR_SECRETS_PLAINTEXT_AT_REST: '1',
        }),
      ).toBe(true);
    });
  });

  describe('effectiveRequireLiffStateSecret', () => {
    it('is true on HTTPS by default', () => {
      expect(effectiveRequireLiffStateSecret(httpsWorker)).toBe(true);
    });

    it('is false when ALLOW_LIFF_OAUTH_API_KEY_FALLBACK is set', () => {
      expect(
        effectiveRequireLiffStateSecret({
          ...httpsWorker,
          ALLOW_LIFF_OAUTH_API_KEY_FALLBACK: '1',
        }),
      ).toBe(false);
    });

    it('is true when REQUIRE overrides ALLOW_LIFF', () => {
      expect(
        effectiveRequireLiffStateSecret({
          ...httpsWorker,
          REQUIRE_LIFF_STATE_SECRET: '1',
          ALLOW_LIFF_OAUTH_API_KEY_FALLBACK: '1',
        }),
      ).toBe(true);
    });
  });

  describe('effectiveRequireTrackingLinkDedicatedSecret', () => {
    it('is true on HTTPS by default', () => {
      expect(effectiveRequireTrackingLinkDedicatedSecret(httpsWorker)).toBe(true);
    });

    it('is false when full RELAX pair is set', () => {
      expect(effectiveRequireTrackingLinkDedicatedSecret(httpsRelaxPair)).toBe(false);
    });

    it('is true when REQUIRE overrides ALLOW_TRACKING', () => {
      expect(
        effectiveRequireTrackingLinkDedicatedSecret({
          ...httpsWorker,
          REQUIRE_TRACKING_LINK_SECRET: '1',
          ALLOW_TRACKING_LINK_API_KEY_FALLBACK: '1',
        }),
      ).toBe(true);
    });
  });

  describe('effectiveRequireDedicatedAdminSessionSecret', () => {
    it('is true on HTTPS by default', () => {
      expect(effectiveRequireDedicatedAdminSessionSecret(httpsWorker)).toBe(true);
    });

    it('is false when ALLOW_LEGACY_API_KEY_SESSION_SIGNER is set', () => {
      expect(
        effectiveRequireDedicatedAdminSessionSecret({
          ...httpsWorker,
          ALLOW_LEGACY_API_KEY_SESSION_SIGNER: '1',
        }),
      ).toBe(false);
    });

    it('is true when REQUIRE overrides ALLOW_LEGACY', () => {
      expect(
        effectiveRequireDedicatedAdminSessionSecret({
          ...httpsWorker,
          REQUIRE_ADMIN_SESSION_SECRET: '1',
          ALLOW_LEGACY_API_KEY_SESSION_SIGNER: '1',
        }),
      ).toBe(true);
    });
  });
});
