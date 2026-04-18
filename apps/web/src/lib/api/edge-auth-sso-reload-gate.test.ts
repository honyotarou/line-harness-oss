import { describe, expect, it } from 'vitest';
import {
  EDGE_AUTH_RELOAD_SESSION_KEY,
  consumeBrowserEdgeAuthSsoReloadSlot,
  type EdgeAuthSsoReloadGateDeps,
} from './edge-auth-sso-reload-gate';

function mockDeps(initial: { ss?: string | null; ck?: string | null }): {
  deps: EdgeAuthSsoReloadGateDeps;
  ss: Map<string, string>;
  cookies: Map<string, string>;
} {
  const ss = new Map<string, string>();
  const cookies = new Map<string, string>();
  if (initial.ss != null) {
    ss.set(EDGE_AUTH_RELOAD_SESSION_KEY, initial.ss);
  }
  if (initial.ck != null) {
    cookies.set('lh_sso_gate_session', initial.ck);
  }
  const deps: EdgeAuthSsoReloadGateDeps = {
    sessionGet: (k) => ss.get(k) ?? null,
    sessionSet: (k, v) => {
      ss.set(k, v);
    },
    sessionRemove: (k) => {
      ss.delete(k);
    },
    cookieRead: (name) => cookies.get(name) ?? null,
    cookieWrite: (name, value, maxAgeSec) => {
      if (maxAgeSec <= 0) {
        cookies.delete(name);
      } else {
        cookies.set(name, value);
      }
    },
  };
  return { deps, ss, cookies };
}

describe('consumeBrowserEdgeAuthSsoReloadSlot', () => {
  it('returns reload on first hit and sets session + cookie', () => {
    const { deps, ss, cookies } = mockDeps({});
    expect(consumeBrowserEdgeAuthSsoReloadSlot(EDGE_AUTH_RELOAD_SESSION_KEY, deps)).toBe('reload');
    expect(ss.get(EDGE_AUTH_RELOAD_SESSION_KEY)).toBe('1');
    expect(cookies.get('lh_sso_gate_session')).toBe('1');
  });

  it('returns throw when sessionStorage gate is already set', () => {
    const { deps, ss, cookies } = mockDeps({ ss: '1' });
    expect(consumeBrowserEdgeAuthSsoReloadSlot(EDGE_AUTH_RELOAD_SESSION_KEY, deps)).toBe('throw');
    expect(ss.has(EDGE_AUTH_RELOAD_SESSION_KEY)).toBe(false);
    expect(cookies.has('lh_sso_gate_session')).toBe(false);
  });

  it('returns throw when only cookie gate is set (sessionStorage failed)', () => {
    const { deps, ss, cookies } = mockDeps({ ck: '1' });
    expect(consumeBrowserEdgeAuthSsoReloadSlot(EDGE_AUTH_RELOAD_SESSION_KEY, deps)).toBe('throw');
    expect(ss.has(EDGE_AUTH_RELOAD_SESSION_KEY)).toBe(false);
    expect(cookies.has('lh_sso_gate_session')).toBe(false);
  });
});
