import {
  effectiveRequireDedicatedAdminSessionSecret,
  formatDeployedSecurityRelaxPairHint,
  isIncompleteGlobalRelaxOnHttps,
  isRelaxedDeployedSecurityDefaults,
} from './deployed-security-defaults.js';
import { parseMinCfBotScore } from './cf-bot-guard.js';

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export type ProductionCloudPolicyEnv = {
  API_KEY?: string;
  WORKER_URL?: string;
  ALLOWED_HOSTNAMES?: string;
  ENABLE_PUBLIC_OPENAPI?: string;
  DISABLE_PUBLIC_OPENAPI?: string;
  ALLOW_LEGACY_API_KEY_BEARER_SESSION?: string;
  REQUIRE_CLOUDFLARE_ACCESS_JWT?: string;
  MIN_CF_BOT_SCORE?: string;
  REQUIRE_CF_BOT_SIGNAL?: string;
  REQUIRE_ADMIN_SESSION_SECRET?: string;
  ADMIN_SESSION_SECRET?: string;
  ALLOW_LEGACY_API_KEY_SESSION_SIGNER?: string;
  BROADCAST_SEND_SECRET?: string;
  ALLOW_BROADCAST_WITHOUT_SEND_SECRET?: string;
  ALLOW_TRACKING_LINK_API_KEY_FALLBACK?: string;
  ALLOW_LIFF_OAUTH_API_KEY_FALLBACK?: string;
  LINE_ACCOUNT_SECRETS_WRITE_SECRET?: string;
  MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID?: string;
  ADMIN_BROWSER_CLIENT_TOKEN?: string;
  ALLOW_DEFAULT_ADMIN_BROWSER_CLIENT?: string;
  ALLOW_LINE_ACCOUNT_SECRETS_PLAINTEXT_AT_REST?: string;
  RELAX_DEPLOYED_SECURITY_DEFAULTS?: string;
  RELAX_DEPLOYED_SECURITY_CONFIRM?: string;
};

/** True when WORKER_URL is a non-local `https:` origin (deployed Worker surface). */
export function isNonLocalHttpsWorkerUrl(url: string): boolean {
  if (!url.trim()) {
    return false;
  }
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') {
      return false;
    }
    const h = u.hostname;
    return h !== 'localhost' && h !== '127.0.0.1' && h !== '::1';
  } catch {
    return false;
  }
}

/**
 * Non-secret checklist for operators (CI / docs / optional logging). Does not expose values.
 */
export function getProductionCloudSurfaceWarnings(env: ProductionCloudPolicyEnv): string[] {
  const warnings: string[] = [];
  const key = env.API_KEY?.trim() ?? '';

  if (key.length > 0 && key.length < 24) {
    warnings.push(
      'API_KEY is shorter than 24 characters; use a long random value (secret manager / wrangler secret).',
    );
  }
  if (/local-dev|change-me|^dummy$|placeholder|dev-placeholder/i.test(key)) {
    warnings.push('API_KEY looks like a dev or placeholder value; rotate before production.');
  }
  if (isTruthyEnvFlag(env.ALLOW_LEGACY_API_KEY_BEARER_SESSION)) {
    warnings.push(
      'ALLOW_LEGACY_API_KEY_BEARER_SESSION is on: stolen API_KEY can satisfy GET /api/auth/session.',
    );
  }
  if (
    isTruthyEnvFlag(env.ALLOW_LEGACY_API_KEY_SESSION_SIGNER) &&
    isNonLocalHttpsWorkerUrl(env.WORKER_URL ?? '')
  ) {
    warnings.push(
      'ALLOW_LEGACY_API_KEY_SESSION_SIGNER is on: admin sessions may be HMAC-signed with API_KEY on a public HTTPS Worker; remove after setting ADMIN_SESSION_SECRET.',
    );
  }
  if (isTruthyEnvFlag(env.ENABLE_PUBLIC_OPENAPI) && !isTruthyEnvFlag(env.DISABLE_PUBLIC_OPENAPI)) {
    warnings.push(
      'Public OpenAPI is enabled (ENABLE_PUBLIC_OPENAPI); disable with DISABLE_PUBLIC_OPENAPI=1 in production if not required.',
    );
  }

  const workerUrl = env.WORKER_URL?.trim() ?? '';
  if (isNonLocalHttpsWorkerUrl(workerUrl)) {
    if (isIncompleteGlobalRelaxOnHttps(env)) {
      warnings.push(
        `RELAX_DEPLOYED_SECURITY_DEFAULTS is on but HTTPS relax is incomplete; strict defaults still apply. Complete staging relax with: ${formatDeployedSecurityRelaxPairHint()}.`,
      );
    }
    if (workerUrl.includes('workers.dev') && !isTruthyEnvFlag(env.REQUIRE_CLOUDFLARE_ACCESS_JWT)) {
      warnings.push(
        'WORKER_URL is on workers.dev but REQUIRE_CLOUDFLARE_ACCESS_JWT is off; restrict with Cloudflare Access or custom domain + allowlist.',
      );
    }
    if (!env.ALLOWED_HOSTNAMES?.trim()) {
      warnings.push(
        'ALLOWED_HOSTNAMES is unset; set an explicit Host allowlist for DNS rebinding / wrong-host hardening.',
      );
    }
    if (parseMinCfBotScore(env) === null) {
      warnings.push(
        'MIN_CF_BOT_SCORE is unset; with Cloudflare Bot Management, set e.g. 30 for POST /api/auth/login to throttle obvious bots.',
      );
    }
    if (effectiveRequireDedicatedAdminSessionSecret(env) && !env.ADMIN_SESSION_SECRET?.trim()) {
      warnings.push(
        `ADMIN_SESSION_SECRET is required on non-local HTTPS (default) or when REQUIRE_ADMIN_SESSION_SECRET=1; set wrangler secret, or ${formatDeployedSecurityRelaxPairHint()}, or ALLOW_LEGACY_API_KEY_SESSION_SIGNER=1 only for migration.`,
      );
    }
    if (!env.BROADCAST_SEND_SECRET?.trim()) {
      warnings.push(
        'BROADCAST_SEND_SECRET is unset; set a secret and require X-Broadcast-Send-Secret on /api/broadcasts/:id/send to add a second factor for mass sends.',
      );
    }
    if (isTruthyEnvFlag(env.ALLOW_BROADCAST_WITHOUT_SEND_SECRET)) {
      warnings.push(
        'ALLOW_BROADCAST_WITHOUT_SEND_SECRET is on: mass-send works without BROADCAST_SEND_SECRET on HTTPS; remove after configuring the send secret.',
      );
    }
    if (isTruthyEnvFlag(env.ALLOW_TRACKING_LINK_API_KEY_FALLBACK)) {
      warnings.push(
        'ALLOW_TRACKING_LINK_API_KEY_FALLBACK is on: tracked-link ?f= tokens may use API_KEY when TRACKING_LINK_SECRET is unset; prefer a dedicated TRACKING_LINK_SECRET.',
      );
    }
    if (isTruthyEnvFlag(env.ALLOW_LIFF_OAUTH_API_KEY_FALLBACK)) {
      warnings.push(
        'ALLOW_LIFF_OAUTH_API_KEY_FALLBACK is on: LIFF OAuth state may be signed with API_KEY; use LIFF_STATE_SECRET in production.',
      );
    }
    if (!env.LINE_ACCOUNT_SECRETS_WRITE_SECRET?.trim()) {
      warnings.push(
        'LINE_ACCOUNT_SECRETS_WRITE_SECRET is unset; set it and require X-Line-Account-Secrets-Write to rotate Messaging API tokens via PUT /api/line-accounts/:id.',
      );
    }
    if (
      isRelaxedDeployedSecurityDefaults(env) &&
      !isTruthyEnvFlag(env.MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID)
    ) {
      warnings.push(
        'Global HTTPS security relax is active: consider MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID=1 when multiple LINE accounts share one Worker.',
      );
    }
    if (
      !env.ADMIN_BROWSER_CLIENT_TOKEN?.trim() &&
      !isTruthyEnvFlag(env.ALLOW_DEFAULT_ADMIN_BROWSER_CLIENT)
    ) {
      warnings.push(
        'ADMIN_BROWSER_CLIENT_TOKEN is unset on a non-local HTTPS Worker; cookie-based admin POSTs require a shared random token (set Worker + web NEXT_PUBLIC_ADMIN_BROWSER_CLIENT_TOKEN) or opt into ALLOW_DEFAULT_ADMIN_BROWSER_CLIENT=1 only for migration.',
      );
    }
    if (isTruthyEnvFlag(env.ALLOW_LINE_ACCOUNT_SECRETS_PLAINTEXT_AT_REST)) {
      warnings.push(
        'ALLOW_LINE_ACCOUNT_SECRETS_PLAINTEXT_AT_REST is on: new LINE accounts may store channel secrets in plaintext without LINE_ACCOUNT_SECRETS_KEY; remove after configuring at-rest encryption.',
      );
    }
  }

  return warnings;
}
