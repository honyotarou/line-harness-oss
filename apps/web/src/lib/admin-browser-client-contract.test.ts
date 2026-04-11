import { ADMIN_BROWSER_CLIENT_HEADER, ADMIN_BROWSER_CLIENT_HEADER_VALUE } from '@line-crm/shared';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_BROWSER_CLIENT_HEADER as apiHeader,
  ADMIN_BROWSER_CLIENT_HEADER_VALUE as apiHeaderValue,
} from './api';

/** Regression: admin `fetchApi` and Worker CSRF/CORS must share one contract. */
describe('admin browser CSRF header contract', () => {
  it('re-exports the same constants as @line-crm/shared', () => {
    expect(apiHeader).toBe(ADMIN_BROWSER_CLIENT_HEADER);
    expect(apiHeaderValue).toBe(ADMIN_BROWSER_CLIENT_HEADER_VALUE);
  });
});
