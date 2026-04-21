import { describe, expect, it, vi } from 'vitest';
import {
  CHUNK_STALE_RELOAD_SESSION_KEY,
  isNextStaticChunkUrl,
  isStaleDeployChunkFailureMessage,
  tryReloadOnceForStaleChunkShell,
} from './chunk-load-recovery-policy.js';

describe('chunk-load-recovery-policy', () => {
  it('detects webpack ChunkLoadError messages', () => {
    expect(
      isStaleDeployChunkFailureMessage('Uncaught ChunkLoadError: Loading chunk 177 failed.'),
    ).toBe(true);
    expect(isStaleDeployChunkFailureMessage('Loading chunk 12 failed')).toBe(true);
  });

  it('detects dynamic import failure messages', () => {
    expect(
      isStaleDeployChunkFailureMessage('TypeError: Failed to fetch dynamically imported module:'),
    ).toBe(true);
    expect(isStaleDeployChunkFailureMessage('error loading dynamically imported module')).toBe(
      true,
    );
  });

  it('detects script module load failures', () => {
    expect(isStaleDeployChunkFailureMessage('Importing a module script failed.')).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(
      isStaleDeployChunkFailureMessage('NetworkError when attempting to fetch resource.'),
    ).toBe(false);
    expect(isStaleDeployChunkFailureMessage('')).toBe(false);
  });

  it('identifies Next chunk URLs', () => {
    expect(isNextStaticChunkUrl('https://example.com/_next/static/chunks/302-abc.js')).toBe(true);
    expect(isNextStaticChunkUrl('/_next/static/chunks/app/layout-deadbeef.js')).toBe(true);
    expect(isNextStaticChunkUrl('/api/foo')).toBe(false);
  });

  it('reloads at most once per session storage', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: vi.fn((k: string) => store.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => {
        store.set(k, v);
      }),
    };
    const reload = vi.fn();
    tryReloadOnceForStaleChunkShell({ storage, reload });
    expect(storage.setItem).toHaveBeenCalledWith(CHUNK_STALE_RELOAD_SESSION_KEY, '1');
    expect(reload).toHaveBeenCalledTimes(1);

    tryReloadOnceForStaleChunkShell({ storage, reload });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when session flag already set', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue('1'),
      setItem: vi.fn(),
    };
    const reload = vi.fn();
    tryReloadOnceForStaleChunkShell({ storage, reload });
    expect(reload).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
