'use client';

import { useEffect } from 'react';
import {
  isNextStaticChunkUrl,
  isStaleDeployChunkFailureMessage,
  tryReloadOnceForStaleChunkShell,
} from '@/lib/chunk-load-recovery-policy';

/**
 * One-shot full reload when hashed `/_next/static/chunks/*` drift after a deploy (CDN / browser
 * cache skew). Keeps listeners in this file; detection caps live in {@link chunk-load-recovery-policy}.
 */
export default function ChunkLoadRecovery() {
  useEffect(() => {
    const scheduleRecovery = () => {
      tryReloadOnceForStaleChunkShell({
        storage: sessionStorage,
        reload: () => {
          window.location.reload();
        },
      });
    };

    const maybeRecover = (message: string) => {
      if (isStaleDeployChunkFailureMessage(message)) {
        scheduleRecovery();
      }
    };

    const onError = (event: ErrorEvent) => {
      const script = event.target;
      if (script instanceof HTMLScriptElement) {
        const src = script.src || '';
        if (isNextStaticChunkUrl(src)) {
          scheduleRecovery();
          return;
        }
      }
      const msg =
        event.message ||
        (event.error instanceof Error ? event.error.message : String(event.error ?? ''));
      maybeRecover(msg);
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const r = event.reason;
      const msg = r instanceof Error ? r.message : typeof r === 'string' ? r : '';
      maybeRecover(msg);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
