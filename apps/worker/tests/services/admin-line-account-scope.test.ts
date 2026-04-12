import { describe, expect, it } from 'vitest';
import {
  lineAccountWriteForbiddenForScope,
  resourceLineAccountVisibleInScope,
  validateScopedLineAccountBody,
  validateScopedLineAccountQueryParam,
} from '../../src/services/admin-line-account-scope.js';

describe('admin-line-account-scope', () => {
  it('validateScopedLineAccountQueryParam allows any query when scope is all', () => {
    expect(validateScopedLineAccountQueryParam({ mode: 'all' }, undefined)).toEqual({ ok: true });
    expect(validateScopedLineAccountQueryParam({ mode: 'all' }, 'acc-1')).toEqual({ ok: true });
  });

  it('validateScopedLineAccountQueryParam requires lineAccountId when restricted', () => {
    const scope = { mode: 'restricted' as const, ids: new Set(['acc-1']) };
    const r = validateScopedLineAccountQueryParam(scope, undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.error).toMatch(/lineAccountId/i);
    }
  });

  it('validateScopedLineAccountQueryParam rejects unknown account when restricted', () => {
    const scope = { mode: 'restricted' as const, ids: new Set(['acc-1']) };
    const r = validateScopedLineAccountQueryParam(scope, 'acc-2');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
    }
  });

  it('resourceLineAccountVisibleInScope hides null account rows from restricted principals', () => {
    const scope = { mode: 'restricted' as const, ids: new Set(['acc-1']) };
    expect(resourceLineAccountVisibleInScope(scope, null)).toBe(false);
    expect(resourceLineAccountVisibleInScope(scope, 'acc-1')).toBe(true);
  });

  it('validateScopedLineAccountBody requires lineAccountId for restricted principals on create', () => {
    const scope = { mode: 'restricted' as const, ids: new Set(['acc-1']) };
    const missing = validateScopedLineAccountBody(scope, undefined);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(400);

    const bad = validateScopedLineAccountBody(scope, 'acc-9');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.status).toBe(403);

    const ok = validateScopedLineAccountBody(scope, 'acc-1');
    expect(ok).toEqual({ ok: true, lineAccountId: 'acc-1' });
  });

  it('validateScopedLineAccountBody allows omitting lineAccountId when scope is all', () => {
    expect(validateScopedLineAccountBody({ mode: 'all' }, undefined)).toEqual({
      ok: true,
      lineAccountId: null,
    });
    expect(validateScopedLineAccountBody({ mode: 'all' }, '  acc-x  ')).toEqual({
      ok: true,
      lineAccountId: 'acc-x',
    });
  });

  it('lineAccountWriteForbiddenForScope blocks mutations unless scope is all', () => {
    const restricted = { mode: 'restricted' as const, ids: new Set(['a1']) };
    expect(lineAccountWriteForbiddenForScope(restricted)).toMatchObject({ forbidden: true });
    expect(lineAccountWriteForbiddenForScope({ mode: 'all' })).toEqual({ forbidden: false });
  });
});
