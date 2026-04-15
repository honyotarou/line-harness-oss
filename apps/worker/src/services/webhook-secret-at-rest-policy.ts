import type { Context } from 'hono';
import type { Env } from '../index.js';
import { parseLineAccountSecretsKey } from '@line-crm/shared/line-account-at-rest';
import { isStrictDeployedHttpsSurface } from './deployed-security-defaults.js';

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * On non-local HTTPS `WORKER_URL`, refuse to persist new webhook secrets unless
 * `LINE_ACCOUNT_SECRETS_KEY` is configured, so D1 does not receive plaintext webhook secrets by default.
 * Opt out with `ALLOW_WEBHOOK_SECRETS_PLAINTEXT_AT_REST=1` (migration only).
 */
export function denyUnlessWebhookSecretsAtRestKeyForWrites(c: Context<Env>): Response | null {
  if (!isStrictDeployedHttpsSurface(c.env)) {
    return null;
  }
  if (isTruthyEnvFlag(c.env.ALLOW_WEBHOOK_SECRETS_PLAINTEXT_AT_REST)) {
    return null;
  }
  if (parseLineAccountSecretsKey(c.env.LINE_ACCOUNT_SECRETS_KEY)) {
    return null;
  }
  return c.json(
    {
      success: false,
      error:
        'LINE_ACCOUNT_SECRETS_KEY is required on this HTTPS Worker so webhook secrets are not stored in plaintext in D1; set wrangler secret or use ALLOW_WEBHOOK_SECRETS_PLAINTEXT_AT_REST=1 only for migration.',
    },
    503,
  );
}
