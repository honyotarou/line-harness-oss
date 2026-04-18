/**
 * SSO edge reload gate: first `redirect: 'manual'` 3xx / opaque auth response triggers one
 * hard reload so `Cf-Access-Jwt-Assertion` can attach; second hit throws.
 *
 * Mirrors state in **sessionStorage** and a short-lived **cookie** so Safari ITP / private mode
 * where sessionStorage writes silently fail do not cause infinite reload loops.
 */

export const EDGE_AUTH_RELOAD_SESSION_KEY = 'lh_edge_auth_sso_reload_session';
export const EDGE_AUTH_RELOAD_LOGIN_KEY = 'lh_edge_auth_sso_reload_login';

const COOKIE_MAX_AGE_SEC = 180;

export type EdgeAuthSsoReloadGateDeps = {
  sessionGet: (key: string) => string | null;
  sessionSet: (key: string, value: string) => void;
  sessionRemove: (key: string) => void;
  cookieRead: (name: string) => string | null;
  cookieWrite: (name: string, value: string, maxAgeSec: number) => void;
};

function cookieNameForFlag(flagKey: string): string {
  if (flagKey === EDGE_AUTH_RELOAD_SESSION_KEY) {
    return 'lh_sso_gate_session';
  }
  if (flagKey === EDGE_AUTH_RELOAD_LOGIN_KEY) {
    return 'lh_sso_gate_login';
  }
  return `lh_sso_gate_${flagKey.replace(/[^a-z0-9_-]/gi, '').slice(0, 40)}`;
}

export function createBrowserEdgeAuthSsoReloadGateDeps(): EdgeAuthSsoReloadGateDeps {
  return {
    sessionGet: (key) => {
      try {
        return globalThis.sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    sessionSet: (key, value) => {
      try {
        globalThis.sessionStorage.setItem(key, value);
      } catch {
        /* ignore */
      }
    },
    sessionRemove: (key) => {
      try {
        globalThis.sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
    cookieRead: (name) => {
      if (typeof document === 'undefined') {
        return null;
      }
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
      return m ? decodeURIComponent(m[1]) : null;
    },
    cookieWrite: (name, value, maxAgeSec) => {
      if (typeof document === 'undefined') {
        return;
      }
      const enc = encodeURIComponent(name);
      const v = encodeURIComponent(value);
      document.cookie = `${enc}=${v}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax; Secure`;
    },
  };
}

/**
 * @returns `'reload'` — caller should hard-reload once; `'throw'` — gate exhausted, surface 401.
 */
export function consumeBrowserEdgeAuthSsoReloadSlot(
  flagKey: string,
  deps: EdgeAuthSsoReloadGateDeps = createBrowserEdgeAuthSsoReloadGateDeps(),
): 'reload' | 'throw' {
  const ck = cookieNameForFlag(flagKey);
  const ssPending = deps.sessionGet(flagKey) === '1';
  const ckPending = deps.cookieRead(ck) === '1';
  if (ssPending || ckPending) {
    deps.sessionRemove(flagKey);
    deps.cookieWrite(ck, '', 0);
    return 'throw';
  }
  deps.sessionSet(flagKey, '1');
  deps.cookieWrite(ck, '1', COOKIE_MAX_AGE_SEC);
  return 'reload';
}

export function clearAllEdgeAuthSsoReloadPersistence(
  deps: EdgeAuthSsoReloadGateDeps = createBrowserEdgeAuthSsoReloadGateDeps(),
): void {
  for (const key of [EDGE_AUTH_RELOAD_SESSION_KEY, EDGE_AUTH_RELOAD_LOGIN_KEY]) {
    deps.sessionRemove(key);
    deps.cookieWrite(cookieNameForFlag(key), '', 0);
  }
}
