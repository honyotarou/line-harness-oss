import { describe, expect, it, vi } from 'vitest';
import {
  AUTH_GUARD_LOGIN_REDIRECT_MAX_IN_WINDOW,
  AUTH_GUARD_LOGIN_REDIRECT_WINDOW_MS,
  recordAuthGuardRedirectToLogin,
  shouldAllowAuthGuardRedirectToLogin,
} from './auth-guard-login-redirect-limit';

describe('auth-guard login redirect limit', () => {
  it('allows fewer than MAX redirects within the window', () => {
    const t0 = 1_000_000;
    const deps = {
      now: () => t0 + 100,
      readTs: () => [t0],
      writeTs: vi.fn(),
    };
    expect(shouldAllowAuthGuardRedirectToLogin(deps)).toBe(true);
  });

  it('blocks when MAX timestamps fall inside the window', () => {
    const t0 = 1_000_000;
    const deps = {
      now: () => t0 + 100,
      readTs: () => [t0 - 50, t0 - 25],
      writeTs: vi.fn(),
    };
    expect(shouldAllowAuthGuardRedirectToLogin(deps)).toBe(false);
  });

  it('ignores timestamps outside the window', () => {
    const t0 = 1_000_000;
    const deps = {
      now: () => t0 + AUTH_GUARD_LOGIN_REDIRECT_WINDOW_MS + 1,
      readTs: () => [t0, t0 + 1],
      writeTs: vi.fn(),
    };
    expect(shouldAllowAuthGuardRedirectToLogin(deps)).toBe(true);
  });

  it('recordAuthGuardRedirectToLogin appends a fresh timestamp inside the window', () => {
    const t0 = 5_000_000;
    let stored: number[] = [t0];
    const deps = {
      now: () => t0 + 100,
      readTs: () => stored,
      writeTs: (ts: number[]) => {
        stored = ts;
      },
    };
    recordAuthGuardRedirectToLogin(deps);
    expect(stored.length).toBe(2);
    expect(stored[1]).toBe(t0 + 100);
  });
});
