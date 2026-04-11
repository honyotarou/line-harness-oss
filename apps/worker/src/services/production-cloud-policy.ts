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
  MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID?: string;
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
    if (!isTruthyEnvFlag(env.REQUIRE_ADMIN_SESSION_SECRET) || !env.ADMIN_SESSION_SECRET?.trim()) {
      warnings.push(
        'Set REQUIRE_ADMIN_SESSION_SECRET=1 and ADMIN_SESSION_SECRET (wrangler secret) so admin sessions are not signed with API_KEY.',
      );
    }
    if (!env.BROADCAST_SEND_SECRET?.trim()) {
      warnings.push(
        'BROADCAST_SEND_SECRET is unset; set a secret and require X-Broadcast-Send-Secret on /api/broadcasts/:id/send to add a second factor for mass sends.',
      );
    }
    if (!isTruthyEnvFlag(env.MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID)) {
      warnings.push(
        'MULTI_LINE_ACCOUNT_QUERY_REQUIRES_LINE_ACCOUNT_ID is unset; enable when multiple LINE accounts share one Worker to require explicit lineAccountId on list APIs.',
      );
    }
  }

  return warnings;
}
