/**
 * Breaks runaway `/login` redirect loops when session checks fail in a tight window (e.g. Access
 * edge 302 fighting AuthGuard + fetch policy).
 */

export const AUTH_GUARD_LOGIN_REDIRECT_WINDOW_MS = 5000;
/** Block the next redirect when this many redirects were already recorded in the window. */
export const AUTH_GUARD_LOGIN_REDIRECT_MAX_IN_WINDOW = 2;

const STORAGE_KEY = 'lh_auth_guard_login_redirect_ts';
const COOKIE_KEY = 'lh_auth_guard_lr';
const COOKIE_MAX_AGE_SEC = 30;

export type AuthGuardLoginRedirectLimitDeps = {
  now: () => number;
  readTs: () => number[];
  writeTs: (ts: number[]) => void;
};

function defaultDeps(): AuthGuardLoginRedirectLimitDeps {
  return {
    now: () => Date.now(),
    readTs: () => {
      try {
        const raw = globalThis.sessionStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return readTsFromCookie();
        }
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
          return [];
        }
        return parsed.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      } catch {
        return readTsFromCookie();
      }
    },
    writeTs: (ts) => {
      const payload = JSON.stringify(ts);
      try {
        globalThis.sessionStorage.setItem(STORAGE_KEY, payload);
      } catch {
        /* ignore */
      }
      writeTsCookie(ts);
    },
  };
}

function readTsFromCookie(): number[] {
  if (typeof document === 'undefined') {
    return [];
  }
  const m = document.cookie.match(/(?:^|; )lh_auth_guard_lr=([^;]*)/);
  if (!m) {
    return [];
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(m[1])) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  } catch {
    return [];
  }
}

function writeTsCookie(ts: number[]): void {
  if (typeof document === 'undefined') {
    return;
  }
  const v = encodeURIComponent(JSON.stringify(ts));
  document.cookie = `${COOKIE_KEY}=${v}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax; Secure`;
}

/** True if redirecting to `/login` is still allowed. */
export function shouldAllowAuthGuardRedirectToLogin(
  deps: AuthGuardLoginRedirectLimitDeps = defaultDeps(),
): boolean {
  const now = deps.now();
  const recent = deps.readTs().filter((t) => now - t < AUTH_GUARD_LOGIN_REDIRECT_WINDOW_MS);
  return recent.length < AUTH_GUARD_LOGIN_REDIRECT_MAX_IN_WINDOW;
}

/** Call immediately before `location.replace('/login')`. */
export function recordAuthGuardRedirectToLogin(
  deps: AuthGuardLoginRedirectLimitDeps = defaultDeps(),
): void {
  const now = deps.now();
  const recent = deps.readTs().filter((t) => now - t < AUTH_GUARD_LOGIN_REDIRECT_WINDOW_MS);
  recent.push(now);
  deps.writeTs(recent);
}
