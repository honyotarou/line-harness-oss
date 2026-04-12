import type { Context } from 'hono';
import type { Env } from '../index.js';
import { timingSafeEqualUtf8 } from './timing-safe-equal.js';

function isTruthyEnvFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** True when the JSON body attempts to rotate Messaging API channel token or secret. */
export function wantsLineAccountCredentialRotation(body: Record<string, unknown>): boolean {
  return (
    ('channelAccessToken' in body && body.channelAccessToken !== undefined) ||
    ('channelSecret' in body && body.channelSecret !== undefined)
  );
}

/**
 * Rotating `channel_access_token` / `channel_secret` requires `LINE_ACCOUNT_SECRETS_WRITE_SECRET`
 * and matching `X-Line-Account-Secrets-Write`, unless `ALLOW_LINE_ACCOUNT_CREDENTIAL_PUT_WITHOUT_EXTRA_SECRET=1` (insecure).
 */
export function denyUnlessLineAccountSecretsWriteAllowed(
  c: Context<Env>,
  body: Record<string, unknown>,
): Response | null {
  if (!wantsLineAccountCredentialRotation(body)) {
    return null;
  }
  if (isTruthyEnvFlag(c.env.ALLOW_LINE_ACCOUNT_CREDENTIAL_PUT_WITHOUT_EXTRA_SECRET)) {
    return null;
  }
  const required = c.env.LINE_ACCOUNT_SECRETS_WRITE_SECRET?.trim();
  if (!required) {
    return c.json(
      {
        success: false,
        error:
          'Forbidden: rotating LINE channel credentials requires LINE_ACCOUNT_SECRETS_WRITE_SECRET and matching X-Line-Account-Secrets-Write header',
      },
      403,
    );
  }
  const provided = c.req.header('X-Line-Account-Secrets-Write')?.trim() ?? '';
  if (!timingSafeEqualUtf8(provided, required)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  return null;
}
