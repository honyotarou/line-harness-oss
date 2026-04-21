/**
 * Stale-deploy shell recovery (Next static export + hashed chunks).
 *
 * When HTML from build N is still shown but `/_next/static/chunks/*` from build N+k is served,
 * chunk requests 404 (often `text/plain`) and the runtime throws ChunkLoadError. Policy lives
 * here; the DOM listener lives in {@link ../components/chunk-load-recovery.tsx}.
 */

export const CHUNK_STALE_RELOAD_SESSION_KEY = 'lh_chunk_stale_reload_once';

export function isStaleDeployChunkFailureMessage(message: string): boolean {
  const m = message.trim();
  if (m.length === 0) return false;
  const lower = m.toLowerCase();
  return (
    m.includes('ChunkLoadError') ||
    m.includes('Loading chunk') ||
    lower.includes('failed to fetch dynamically imported module') ||
    lower.includes('error loading dynamically imported module') ||
    lower.includes('importing a module script failed')
  );
}

export function isNextStaticChunkUrl(pathOrUrl: string): boolean {
  return pathOrUrl.includes('/_next/static/chunks/');
}

export type StaleChunkReloadDeps = Readonly<{
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  reload: () => void;
}>;

/** Single reload per tab session to recover from post-deploy hash skew without infinite loops. */
export function tryReloadOnceForStaleChunkShell(deps: StaleChunkReloadDeps): void {
  const raw = deps.storage.getItem(CHUNK_STALE_RELOAD_SESSION_KEY);
  const n = raw ? Number(raw) : 0;
  if (Number.isNaN(n) || n >= 1) return;
  deps.storage.setItem(CHUNK_STALE_RELOAD_SESSION_KEY, '1');
  deps.reload();
}
