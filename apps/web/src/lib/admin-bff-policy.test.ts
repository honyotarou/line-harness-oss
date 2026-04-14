import { describe, expect, it } from 'vitest';
import {
  isEligibleWorkerAdminProxyTargetPath,
  stripAdminAccessProxyPrefix,
  validateAdminApiFetchBase,
} from '@line-crm/shared';

describe('admin Access BFF policy (shared)', () => {
  it('stripAdminAccessProxyPrefix removes configured prefix', () => {
    expect(stripAdminAccessProxyPrefix('/api/lh-upstream/api/auth/login', '/api/lh-upstream')).toBe(
      '/api/auth/login',
    );
    expect(stripAdminAccessProxyPrefix('/api/lh-upstream', '/api/lh-upstream')).toBe('/');
    expect(stripAdminAccessProxyPrefix('/api/other/api/foo', '/api/lh-upstream')).toBe(null);
  });

  it('isEligibleWorkerAdminProxyTargetPath rejects traversal', () => {
    expect(isEligibleWorkerAdminProxyTargetPath('/api/auth/login')).toBe(true);
    expect(isEligibleWorkerAdminProxyTargetPath('/webhook')).toBe(false);
    expect(isEligibleWorkerAdminProxyTargetPath('/api/../etc/passwd')).toBe(false);
  });

  it('validateAdminApiFetchBase allows origin-only and /api prefix bases', () => {
    const a = validateAdminApiFetchBase('https://crm.example.com/', {
      allowPlaceholderTemplate: false,
    });
    expect(a.ok && a.fetchBase).toBe('https://crm.example.com');

    const b = validateAdminApiFetchBase('https://admin.example.com/api/lh-upstream', {
      allowPlaceholderTemplate: false,
    });
    expect(b.ok && b.fetchBase).toBe('https://admin.example.com/api/lh-upstream');
    expect(b.ok && b.origin).toBe('https://admin.example.com');
  });

  it('validateAdminApiFetchBase rejects non-api path segments', () => {
    const r = validateAdminApiFetchBase('https://admin.example.com/v1/api', {
      allowPlaceholderTemplate: false,
    });
    expect(r.ok).toBe(false);
  });
});
