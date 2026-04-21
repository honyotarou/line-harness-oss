import { describe, expect, it } from 'vitest';
import {
  buildAdminAccessLoginCompleteReturnTo,
  isAdminAccessLoginCompletePath,
  stripAdminAccessLoginCompleteMarker,
} from '@line-crm/shared';

describe('admin access login complete helpers', () => {
  it('marks the login path for post-Access session bootstrap', () => {
    expect(buildAdminAccessLoginCompleteReturnTo('/login')).toBe('/login?access=complete');
    expect(buildAdminAccessLoginCompleteReturnTo('/login?from=cf')).toBe(
      '/login?from=cf&access=complete',
    );
  });

  it('detects only the login completion marker', () => {
    expect(isAdminAccessLoginCompletePath('/login?access=complete')).toBe(true);
    expect(isAdminAccessLoginCompletePath('/login')).toBe(false);
    expect(isAdminAccessLoginCompletePath('/friends?access=complete')).toBe(false);
  });

  it('strips the marker after the login page consumes it', () => {
    expect(stripAdminAccessLoginCompleteMarker('/login?access=complete')).toBe('/login');
    expect(stripAdminAccessLoginCompleteMarker('/login?from=cf&access=complete')).toBe(
      '/login?from=cf',
    );
  });
});
