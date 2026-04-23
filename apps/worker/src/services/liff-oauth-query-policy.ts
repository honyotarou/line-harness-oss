import { isNonLocalHttpsWorkerUrl } from './production-cloud-policy.js';

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export type LiffOAuthQueryPolicyEnv = Readonly<{
  WORKER_URL?: string;
  /** When set on non-local HTTPS, allows `?account=` on GET /auth/line (tenant-pivot / phishing risk if misused). */
  ALLOW_LIFF_OAUTH_QUERY_ACCOUNT?: string;
  /** When set on non-local HTTPS, allows `?uid=` in OAuth state (cross-account binding risk if misused). */
  ALLOW_LIFF_OAUTH_QUERY_UID?: string;
}>;

/** Local / non-HTTPS Worker URLs allow query pivots for developer ergonomics; public HTTPS requires explicit opt-in. */
export function effectiveAllowLiffOAuthQueryAccount(env: LiffOAuthQueryPolicyEnv): boolean {
  if (isTruthyEnvFlag(env.ALLOW_LIFF_OAUTH_QUERY_ACCOUNT)) return true;
  return !isNonLocalHttpsWorkerUrl(env.WORKER_URL ?? '');
}

export function effectiveAllowLiffOAuthQueryUid(env: LiffOAuthQueryPolicyEnv): boolean {
  if (isTruthyEnvFlag(env.ALLOW_LIFF_OAUTH_QUERY_UID)) return true;
  return !isNonLocalHttpsWorkerUrl(env.WORKER_URL ?? '');
}
