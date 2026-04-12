import type { LineAccountDbOptions } from '@line-crm/db';
import { parseLineAccountSecretsKey } from '@line-crm/shared/line-account-at-rest';

/** Maps Worker `LINE_ACCOUNT_SECRETS_KEY` into D1 read/write options for `line_accounts` secrets. */
export function lineAccountDbOptions(bindings: {
  LINE_ACCOUNT_SECRETS_KEY?: string;
}): LineAccountDbOptions | undefined {
  const k = parseLineAccountSecretsKey(bindings.LINE_ACCOUNT_SECRETS_KEY);
  return k ? { atRestKey: k } : undefined;
}
