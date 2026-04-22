/**
 * Centralizes "secure by default" for non-local HTTPS `WORKER_URL` deployments.
 * On non-local HTTPS, `RELAX_DEPLOYED_SECURITY_DEFAULTS=1` alone is ignored; also set
 * `RELAX_DEPLOYED_SECURITY_CONFIRM` to {@link RELAX_SECURITY_CONFIRM_PHRASE} (two-step) so staging
 * relax cannot be enabled by a single mis-set variable.
 *
 * Global relax still eases automation allowlists, multi-account query rules, calendar encryption, etc.,
 * but it does **not** implicitly allow `API_KEY` as the HMAC secret for admin sessions, LIFF OAuth
 * `state`, or tracked-link `?f=` tokens — use explicit `ALLOW_*` flags for those narrow exceptions.
 */

import { isNonLocalHttpsWorkerUrl } from './production-cloud-policy.js';

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Exact value required in `RELAX_DEPLOYED_SECURITY_CONFIRM` when relaxing HTTPS defaults. */
export const RELAX_SECURITY_CONFIRM_PHRASE = 'YES_I_ACCEPT_REDUCED_SECURITY' as const;

/** Operator-facing hint for error messages (routes may import this; env reads stay in this module). */
export function formatDeployedSecurityRelaxPairHint(): string {
  return `RELAX_DEPLOYED_SECURITY_DEFAULTS=1 together with RELAX_DEPLOYED_SECURITY_CONFIRM=${RELAX_SECURITY_CONFIRM_PHRASE}`;
}

export type DeployedSecurityBindings = Readonly<{
  WORKER_URL?: string;
  RELAX_DEPLOYED_SECURITY_DEFAULTS?: string;
  /** Must equal {@link RELAX_SECURITY_CONFIRM_PHRASE} for global relax on non-local HTTPS. */
  RELAX_DEPLOYED_SECURITY_CONFIRM?: string;
}>;

function relaxedSecurityConfirmMatches(env: {
  RELAX_DEPLOYED_SECURITY_CONFIRM?: string;
}): boolean {
  return env.RELAX_DEPLOYED_SECURITY_CONFIRM?.trim() === RELAX_SECURITY_CONFIRM_PHRASE;
}

/**
 * Staging / migration: skip HTTPS auto-require behaviors (individual `ALLOW_*` flags still apply).
 * On non-local HTTPS, both `RELAX_DEPLOYED_SECURITY_DEFAULTS` and `RELAX_DEPLOYED_SECURITY_CONFIRM`
 * must be set; otherwise defaults stay strict.
 */
export function isRelaxedDeployedSecurityDefaults(env: DeployedSecurityBindings): boolean {
  if (!isTruthyEnvFlag(env.RELAX_DEPLOYED_SECURITY_DEFAULTS)) {
    return false;
  }
  if (isNonLocalHttpsWorkerUrl(env.WORKER_URL ?? '')) {
    return relaxedSecurityConfirmMatches(env);
  }
  return true;
}

/** True when RELAX flag is on HTTPS but the acknowledgement phrase is missing or wrong. */
export function isIncompleteGlobalRelaxOnHttps(env: DeployedSecurityBindings): boolean {
  if (!isTruthyEnvFlag(env.RELAX_DEPLOYED_SECURITY_DEFAULTS)) {
    return false;
  }
  if (!isNonLocalHttpsWorkerUrl(env.WORKER_URL ?? '')) {
    return false;
  }
  return !relaxedSecurityConfirmMatches(env);
}

/** Public HTTPS Worker surface without the global relax switch. */
export function isStrictDeployedHttpsSurface(env: DeployedSecurityBindings): boolean {
  return isNonLocalHttpsWorkerUrl(env.WORKER_URL ?? '') && !isRelaxedDeployedSecurityDefaults(env);
}

export type AutomationWebhookSecurityEnv = DeployedSecurityBindings & {
  REQUIRE_AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS?: string;
  ALLOW_AUTOMATION_SEND_WEBHOOK_WITHOUT_HOST_ALLOWLIST?: string;
};

/**
 * When true, `send_webhook` automations fail unless `AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS` is non-empty
 * (see `event-bus` allowlist enforcement).
 */
export function effectiveRequireAutomationSendWebhookHostAllowlist(
  env: AutomationWebhookSecurityEnv,
): boolean {
  if (isTruthyEnvFlag(env.REQUIRE_AUTOMATION_SEND_WEBHOOK_ALLOWED_HOSTS)) {
    return true;
  }
  if (isTruthyEnvFlag(env.ALLOW_AUTOMATION_SEND_WEBHOOK_WITHOUT_HOST_ALLOWLIST)) {
    return false;
  }
  if (isRelaxedDeployedSecurityDefaults(env)) {
    return false;
  }
  return isNonLocalHttpsWorkerUrl(env.WORKER_URL ?? '');
}

export type MultiLineAccountSecurityEnv = DeployedSecurityBindings & {
  MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID?: string;
  ALLOW_MULTI_LINE_ACCOUNT_QUERY_WITHOUT_LINE_ACCOUNT_ID?: string;
};

export function effectiveMultiLineAccountQueryRequiresLineAccountId(
  env: MultiLineAccountSecurityEnv,
): boolean {
  if (isTruthyEnvFlag(env.MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID)) {
    return true;
  }
  if (isTruthyEnvFlag(env.ALLOW_MULTI_LINE_ACCOUNT_QUERY_WITHOUT_LINE_ACCOUNT_ID)) {
    return false;
  }
  if (isRelaxedDeployedSecurityDefaults(env)) {
    return false;
  }
  return isNonLocalHttpsWorkerUrl(env.WORKER_URL ?? '');
}

export type CalendarTokenSecurityEnv = DeployedSecurityBindings & {
  REQUIRE_CALENDAR_TOKEN_ENCRYPTION?: string;
  ALLOW_CALENDAR_SECRETS_PLAINTEXT_AT_REST?: string;
};

export function effectiveRequireCalendarTokenEncryption(env: CalendarTokenSecurityEnv): boolean {
  if (isTruthyEnvFlag(env.REQUIRE_CALENDAR_TOKEN_ENCRYPTION)) {
    return true;
  }
  if (isTruthyEnvFlag(env.ALLOW_CALENDAR_SECRETS_PLAINTEXT_AT_REST)) {
    return false;
  }
  if (isRelaxedDeployedSecurityDefaults(env)) {
    return false;
  }
  return isNonLocalHttpsWorkerUrl(env.WORKER_URL ?? '');
}

export type LiffOAuthStateSecurityEnv = DeployedSecurityBindings & {
  REQUIRE_LIFF_STATE_SECRET?: string;
  ALLOW_LIFF_OAUTH_API_KEY_FALLBACK?: string;
};

/** Read `ALLOW_LIFF_OAUTH_API_KEY_FALLBACK` only here (keeps LIFF OAuth relax policy in one module). */
export function explicitLiffOAuthApiKeyFallbackEnabled(env: LiffOAuthStateSecurityEnv): boolean {
  return isTruthyEnvFlag(env.ALLOW_LIFF_OAUTH_API_KEY_FALLBACK);
}

/** When true, OAuth `state` must use `LIFF_STATE_SECRET` only (no `API_KEY` fallback). */
export function effectiveRequireLiffStateSecret(env: LiffOAuthStateSecurityEnv): boolean {
  if (isTruthyEnvFlag(env.REQUIRE_LIFF_STATE_SECRET)) {
    return true;
  }
  if (explicitLiffOAuthApiKeyFallbackEnabled(env)) {
    return false;
  }
  return isNonLocalHttpsWorkerUrl(env.WORKER_URL ?? '');
}

export type TrackingLinkSecretSecurityEnv = DeployedSecurityBindings & {
  REQUIRE_TRACKING_LINK_SECRET?: string;
  ALLOW_TRACKING_LINK_API_KEY_FALLBACK?: string;
};

/** When true, `?f=` HMAC must use `TRACKING_LINK_SECRET` (no `API_KEY` fallback). */
export function effectiveRequireTrackingLinkDedicatedSecret(
  env: TrackingLinkSecretSecurityEnv,
): boolean {
  if (isTruthyEnvFlag(env.REQUIRE_TRACKING_LINK_SECRET)) {
    return true;
  }
  if (isTruthyEnvFlag(env.ALLOW_TRACKING_LINK_API_KEY_FALLBACK)) {
    return false;
  }
  return isNonLocalHttpsWorkerUrl(env.WORKER_URL ?? '');
}

export type AdminSessionSecretPolicyEnv = DeployedSecurityBindings & {
  REQUIRE_ADMIN_SESSION_SECRET?: string;
  ALLOW_LEGACY_API_KEY_SESSION_SIGNER?: string;
};

/**
 * When true, admin HMAC sessions must use `ADMIN_SESSION_SECRET` (not `API_KEY` as signer).
 * Matches explicit `REQUIRE_ADMIN_SESSION_SECRET` or strict non-local HTTPS defaults.
 */
export function effectiveRequireDedicatedAdminSessionSecret(
  env: AdminSessionSecretPolicyEnv,
): boolean {
  if (isTruthyEnvFlag(env.REQUIRE_ADMIN_SESSION_SECRET)) {
    return true;
  }
  // On strict public HTTPS surfaces, always require a dedicated session signer
  // (do not allow API_KEY to double as a session signing secret).
  if (isStrictDeployedHttpsSurface(env)) {
    return true;
  }
  if (isTruthyEnvFlag(env.ALLOW_LEGACY_API_KEY_SESSION_SIGNER)) {
    return false;
  }
  return isNonLocalHttpsWorkerUrl(env.WORKER_URL ?? '');
}
