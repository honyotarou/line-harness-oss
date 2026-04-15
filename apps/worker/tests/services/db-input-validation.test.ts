import { describe, expect, it } from 'vitest';

describe('@line-crm/db stored-field guards', () => {
  it('assertHttpOrHttpsTrackedOriginalUrl rejects javascript:', async () => {
    const { assertHttpOrHttpsTrackedOriginalUrl } = await import('@line-crm/db');
    expect(() => assertHttpOrHttpsTrackedOriginalUrl('javascript:alert(1)')).toThrow(/https/);
  });

  it('assertValidEntryRouteRefCode rejects path-like codes', async () => {
    const { assertValidEntryRouteRefCode } = await import('@line-crm/db');
    expect(() => assertValidEntryRouteRefCode('ref/code')).toThrow();
  });
});
