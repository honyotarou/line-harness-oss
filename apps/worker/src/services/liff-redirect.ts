import type { AllowedOriginsEnv } from '@line-crm/shared';
export { resolveSafeRedirectUrl } from '@line-crm/shared';

/** Same shape as CORS env — used for OAuth / wrapped-link redirect allowlisting. */
export type LiffRedirectEnv = AllowedOriginsEnv;
