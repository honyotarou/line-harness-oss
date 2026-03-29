/**
 * Ensures production LIFF bundles are not shipped without a Worker API base URL.
 * Vite calls this from vite.config.ts at config load time.
 */
export function assertLiffProductionApiUrl(
  mode: string,
  viteApiUrl: string | undefined,
  processEnv: NodeJS.ProcessEnv,
): void {
  if (mode !== 'production') return;
  if (processEnv.VITE_ALLOW_EMPTY_LIFF_API === '1') return;
  const t = typeof viteApiUrl === 'string' ? viteApiUrl.trim() : '';
  if (t === '') {
    throw new Error(
      'LIFF production build requires VITE_API_URL (Worker base URL, no trailing slash). ' +
        'Example: VITE_API_URL=https://your-worker.workers.dev pnpm --filter liff build. ' +
        'To skip this check (e.g. local experiments only): VITE_ALLOW_EMPTY_LIFF_API=1',
    );
  }
}
